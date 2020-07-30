const Especial = require('./src/server')
const EspecialClient = require('./src/client')

function especial() {
  return new Especial()
}

especial.EspecialClient = EspecialClient

module.exports = especial
