const glob = require('glob');
const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    utility: './chrome/Echofon/content/utility.js',
  },
  output: {
    filename: '[name].js',
    path: 'build/src/chrome/Echofon/content',
    libraryTarget: 'var',
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        use: ['babel-loader'],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx", ".json"],
  },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
  },
};