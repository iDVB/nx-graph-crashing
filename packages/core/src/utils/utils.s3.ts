import * as readline from 'readline'
import { Readable } from 'stream'
import * as zlib from 'zlib'

import {
  CopyObjectCommand,
  CopyObjectCommandInput,
  DeleteBucketCommand,
  DeleteMarkerEntry,
  DeleteObjectsCommand,
  DeleteObjectsCommandOutput,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  ListObjectVersionsCommandInput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  ObjectIdentifier,
  ObjectVersion,
  PutBucketVersioningCommand,
  PutBucketVersioningCommandOutput,
  S3Client,
  _Object,
} from '@aws-sdk/client-s3'
import { chunk as _chunk } from 'lodash-es'

import { logger } from './utils.logger.js'

// S3Utils

export class S3Utils {
  s3Client: S3Client

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client
  }

  private async deleteChunk(
    Bucket: string,
    Objects: ObjectIdentifier[],
  ): Promise<DeleteObjectsCommandOutput> {
    const response = await this.s3Client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: {
          Objects,
        },
      }),
    )
    logger('deleteObjects resp', JSON.stringify(response))
    return response
  }

  private async deleteAllVersionsAndMarkers(Bucket: string): Promise<DeleteObjectsCommandOutput[]> {
    logger('deleteAllVersionsAndMarkers', Bucket)
    const { versions, markers } = await this.listAllObjectVersions(Bucket)
    logger('deleteAllVersionsAndMarkers', Bucket, {
      versions: versions.length,
      markers: markers.length,
    })
    return this.deleteObjects(
      Bucket,
      [...versions, ...markers].flatMap(({ Key, VersionId }) =>
        Key && VersionId ? { Key, VersionId } : [],
      ),
    )
  }

  private async deleteAllObjects(Bucket: string): Promise<DeleteObjectsCommandOutput[]> {
    logger('deleteAllObjects', Bucket)
    const keys = await this.listAllKeys({ Bucket })
    logger(`deleteAllObjects keys`, Bucket, keys.length)
    return this.deleteObjects(
      Bucket,
      keys.flatMap(({ Key }) => (Key ? { Key } : [])),
    )
  }

  // eslint-disable-next-line
  async getObjects(Bucket: string, Keys: string[], fn?: any): Promise<any[]> {
    return Promise.all(
      Keys.map((Key) =>
        this.s3Client
          .send(new GetObjectCommand({ Bucket, Key }))
          .then(({ Body }) => (fn ? fn(Body) : Body)),
      ),
    )
  }

  async getJSONFromReadStreamPerLine(fileStream: Readable): Promise<Record<string, unknown>[]> {
    const line$ = () =>
      readline.createInterface({
        input: fileStream.pipe(zlib.createGunzip()),
        crlfDelay: Infinity,
      })

    const jsonArray: Record<string, unknown>[] = []
    for await (const line of line$()) {
      const json = JSON.parse(line)
      jsonArray.push(json)
    }

    return jsonArray
  }

  async isBucketVersioned(Bucket: string): Promise<boolean> {
    logger('isBucketVersioned', Bucket)
    const { Status } = await this.s3Client.send(new GetBucketVersioningCommand({ Bucket }))
    logger('isBucketVersioned resp:', { Bucket, Status })
    return Status === 'Enabled'
  }

  async doesBucketExist(Bucket: string): Promise<boolean> {
    logger('doesBucketExist', Bucket)
    return this.s3Client
      .send(new HeadBucketCommand({ Bucket }))
      .then(() => true)
      .catch((e) => {
        console.log(`doesBucketExist: ${Bucket}`, e)
        return false
      })
  }

  async listAllKeys(options: ListObjectsV2CommandInput): Promise<_Object[]> {
    logger('listAllKeys', options)
    let keys: _Object[] = []
    let ContinuationToken
    let keepFetching = true
    while (keepFetching) {
      const input: ListObjectsV2CommandInput = {
        ...options,
        MaxKeys: 1000,
        ContinuationToken,
      }
      const { Contents, IsTruncated, NextContinuationToken } = await this.s3Client.send(
        new ListObjectsV2Command(input),
      )
      if (!Contents) return keys
      if (IsTruncated) ContinuationToken = NextContinuationToken
      keys = keys.concat(Contents)
      keepFetching = !!IsTruncated
    }
    logger('listAllKeys key(s) length:', keys.length)
    return keys
  }

  async listAllObjectVersions(
    Bucket: string,
  ): Promise<{ versions: ObjectVersion[]; markers: DeleteMarkerEntry[] }> {
    logger('listAllObjectVersions', Bucket)
    let versions: ObjectVersion[] = []
    let markers: DeleteMarkerEntry[] = []
    let KeyMarker
    let VersionIdMarker
    let keepFetching = true
    while (keepFetching) {
      const input: ListObjectVersionsCommandInput = {
        MaxKeys: 1000,
        Bucket,
        KeyMarker,
        VersionIdMarker,
      }

      const { Versions, DeleteMarkers, IsTruncated, NextKeyMarker, NextVersionIdMarker } =
        await this.s3Client.send(new ListObjectVersionsCommand(input))

      if (IsTruncated) {
        KeyMarker = NextKeyMarker
        VersionIdMarker = NextVersionIdMarker
      }
      if (Versions) versions = versions.concat(Versions)
      if (DeleteMarkers) markers = markers.concat(DeleteMarkers)
      keepFetching = !!IsTruncated
    }
    logger('listAllObjectVersions resp: ', {
      versions: versions.length,
      markers: markers.length,
    })

    return {
      versions,
      markers,
    }
  }

  copyObject(params: CopyObjectCommandInput) {
    return this.s3Client.send(new CopyObjectCommand(params))
  }

  copyObjects(paramArr: CopyObjectCommandInput[]) {
    return Promise.all(paramArr.map(this.copyObject.bind(this)))
  }

  deleteObjects(
    Bucket: string,
    objects: ObjectIdentifier[],
  ): Promise<DeleteObjectsCommandOutput[]> {
    logger('deleteObjects', Bucket, objects.length)
    return Promise.all(_chunk(objects, 1000).map((chunk: any) => this.deleteChunk(Bucket, chunk)))
  }

  async deleteDirectory(
    bucket: string,
    Prefix: string,
  ): Promise<DeleteObjectsCommandOutput[] | void> {
    logger(`Deleting Dir: ${Prefix} from Bucket: ${bucket}`)
    const doesExist = await this.doesBucketExist(bucket)
    if (!doesExist) throw new Error(`Bucket ${bucket} does not exist.`)

    const keys = await this.listAllKeys({ Bucket: bucket, Prefix })

    return this.deleteObjects(
      bucket,
      keys.map(({ Key }) => ({ Key })),
    )
  }

  async disableVersioning(Bucket: string): Promise<PutBucketVersioningCommandOutput> {
    logger('disableVersioning', Bucket)
    const response = await this.s3Client.send(
      new PutBucketVersioningCommand({
        Bucket,
        VersioningConfiguration: {
          Status: 'Suspended',
        },
      }),
    )
    logger('disableVersioning resp: ', JSON.stringify(response))
    return response
  }

  async emptyBucket(Bucket: string, disableVersioning = false): Promise<void> {
    logger('emptyBucket', Bucket)
    const doesExist = await this.doesBucketExist(Bucket)
    if (doesExist) {
      const isVersioned = await this.isBucketVersioned(Bucket)

      if (disableVersioning) await this.disableVersioning(Bucket)
      if (isVersioned) {
        await this.deleteAllVersionsAndMarkers(Bucket)
      } else {
        await this.deleteAllObjects(Bucket)
      }
    }
    return
  }

  emptyBuckets(Buckets: string[], disableVersioning: boolean): Promise<void[]> {
    return Promise.all(Buckets.map((bucket) => this.emptyBucket(bucket, disableVersioning)))
  }

  async nukeBucket(Bucket: string): Promise<void> {
    logger('nukeBucket', Bucket)
    await this.emptyBucket(Bucket)
    await this.s3Client.send(new DeleteBucketCommand({ Bucket }))
    return
  }
}
