module.exports = {
  extends: ['eslint:recommended', 'react-app', 'prettier'],
  plugins: ['prettier', 'react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'react/jsx-fragments': 'error',
  },
  overrides: [
    {
      files: '*.md',
      rules: {
        'prettier/prettier': [
          'error',
          {
            parser: 'markdown',
          },
        ],
      },
    },
    {
      files: ['*.md', '*.mdx'],
      // parser: 'eslint-mdx', // this is set by `plugin:mdx/recommended` implicitly
      extends: ['plugin:mdx/recommended'],
    },
  ],
}
