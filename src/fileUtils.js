const fs = require('fs');
const path = require('path');

function readConfig(configName) {
  const configPath = path.join(__dirname, 'configs', configName + '.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getOutputPath(filename) {
  return path.join(__dirname, 'output', filename);
}

function readTextFile(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

module.exports = { readConfig, getOutputPath, readTextFile };
