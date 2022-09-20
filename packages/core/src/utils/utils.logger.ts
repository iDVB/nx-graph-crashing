import debug from 'debug'

export const logger = debug('logger:logs')
// eslint-disable-next-line no-undef
logger.log = console.log.bind(console)
