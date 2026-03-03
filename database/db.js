const mysql = require("mysql2/promise");
const path = require("path");

// Configuración para Hostinger
const pool = mysql.createPool({
  host: "193.203.175.83", // El host de Hostinger
  user: "u617147599_MindLag", // Tu usuario
  password: "Micronics159357", // ← PON AQUÍ LA CONTRASEÑA
  database: "u617147599_SalaQlo", // Tu base de datos
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "Z",
});

console.log("📁 Conectando a MySQL en Hostinger...");

// Probar conexión
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión a MySQL exitosa");
    console.log("📊 Base de datos:", connection.config.database);
    connection.release();
  } catch (error) {
    console.error("❌ Error conectando a MySQL:", error.message);
  }
}

testConnection();

module.exports = pool;
