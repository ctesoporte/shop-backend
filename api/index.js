// Vercel serverless entry point.
// La app Express exportada por ../index.js maneja todas las rutas.
require('dotenv').config()
module.exports = require('../index.js')
