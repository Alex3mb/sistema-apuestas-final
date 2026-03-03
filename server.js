const express = require("express");
const path = require("path");
const db = require("./database/db");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde public/
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// RUTAS DE JUGADORES - MYSQL
// ============================================

// Registrar jugador
app.post("/jugador", async (req, res) => {
  const { nombre } = req.body;
  console.log("📥 POST /jugador - Nombre:", nombre);

  if (!nombre) return res.status(400).json({ error: "Faltan datos" });

  try {
    const [result] = await db.query(
      "INSERT INTO jugadores (nombre, saldo_total, activo) VALUES (?, 0, 1)",
      [nombre],
    );

    console.log(`✅ Jugador registrado con ID: ${result.insertId}`);
    res.json({
      mensaje: "Jugador registrado correctamente",
      id: result.insertId,
    });
  } catch (error) {
    console.error("❌ Error registrando jugador:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El jugador ya existe" });
    }

    res.status(400).json({ error: "Error al registrar jugador" });
  }
});

// Ver jugadores
app.get("/jugadores", async (req, res) => {
  console.log("📥 GET /jugadores - Solicitado");

  try {
    const [rows] = await db.query(
      "SELECT id, nombre, saldo_total, activo FROM jugadores ORDER BY activo DESC, nombre",
    );

    console.log(`✅ Enviados ${rows.length} jugadores`);
    res.json(rows);
  } catch (error) {
    console.error("❌ Error en /jugadores:", error);
    res.status(500).json({
      error: "Error al obtener jugadores",
      detalle: error.message,
    });
  }
});

// Modificar jugador
app.post("/jugador/modificar", async (req, res) => {
  const { id, nombre, saldo, activo } = req.body;
  console.log("📥 POST /jugador/modificar - ID:", id);

  if (!id) return res.status(400).json({ error: "ID requerido" });

  try {
    let updates = [];
    let params = [];

    if (nombre !== undefined) {
      updates.push("nombre = ?");
      params.push(nombre);
    }
    if (saldo !== undefined) {
      updates.push("saldo_total = ?");
      params.push(saldo);
    }
    if (activo !== undefined) {
      updates.push("activo = ?");
      params.push(activo);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay datos para modificar" });
    }

    params.push(id);
    const query = `UPDATE jugadores SET ${updates.join(", ")} WHERE id = ?`;

    const [result] = await db.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Jugador no encontrado" });
    }

    res.json({ mensaje: "Jugador modificado correctamente" });
  } catch (error) {
    console.error("❌ Error modificando jugador:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Ese nombre ya está en uso" });
    }

    res.status(400).json({ error: "Error al modificar jugador" });
  }
});

// Eliminar jugador
app.delete("/jugador/eliminar/:id", async (req, res) => {
  const id = req.params.id;
  console.log("📥 DELETE /jugador/eliminar - ID:", id);

  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {
    const [result] = await db.query("DELETE FROM jugadores WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Jugador no encontrado" });
    }

    res.json({ mensaje: "Jugador eliminado correctamente" });
  } catch (error) {
    console.error("❌ Error eliminando jugador:", error);
    res.status(500).json({ error: "Error al eliminar jugador" });
  }
});

// Actualizar saldo (sistema anterior)
app.post("/resultado", async (req, res) => {
  const { jugador_id, cambio } = req.body;
  console.log("📥 POST /resultado - Jugador:", jugador_id, "Cambio:", cambio);

  if (!jugador_id || cambio === undefined) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  try {
    await db.query(
      "UPDATE jugadores SET saldo_total = saldo_total + ? WHERE id = ?",
      [cambio, jugador_id],
    );

    res.json({ mensaje: "Saldo actualizado correctamente" });
  } catch (error) {
    console.error("❌ Error actualizando saldo:", error);
    res.status(500).json({ error: "Error al actualizar saldo" });
  }
});

// ============================================
// RUTAS PARA EL SISTEMA 5 VS 5 - MYSQL
// ============================================

// Crear una nueva ronda con equipos
app.post("/api/ronda/nueva", async (req, res) => {
  const { equipoA, equipoB } = req.body;
  console.log(
    "📥 POST /api/ronda/nueva - Equipo A:",
    equipoA?.length,
    "Equipo B:",
    equipoB?.length,
  );

  if (!equipoA || !equipoB || equipoA.length === 0 || equipoB.length === 0) {
    return res
      .status(400)
      .json({ error: "Se requieren ambos equipos con jugadores" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Crear la ronda
    const [rondaResult] = await connection.query(
      "INSERT INTO rondas (estado) VALUES ('activa')",
    );
    const rondaId = rondaResult.insertId;
    console.log(`✅ Ronda creada ID: ${rondaId}`);

    // 2. Crear equipo A
    const [equipoAResult] = await connection.query(
      "INSERT INTO equipos_ronda (ronda_id, nombre_equipo) VALUES (?, 'A')",
      [rondaId],
    );
    const equipoAId = equipoAResult.insertId;

    // 3. Crear equipo B
    const [equipoBResult] = await connection.query(
      "INSERT INTO equipos_ronda (ronda_id, nombre_equipo) VALUES (?, 'B')",
      [rondaId],
    );
    const equipoBId = equipoBResult.insertId;

    // 4. Insertar apuestas del equipo A
    for (const j of equipoA) {
      await connection.query(
        "INSERT INTO apuestas_ronda (ronda_id, equipo_id, jugador_id, monto_apuesta) VALUES (?, ?, ?, ?)",
        [rondaId, equipoAId, j.jugador_id, j.apuesta || 0],
      );
    }

    // 5. Insertar apuestas del equipo B
    for (const j of equipoB) {
      await connection.query(
        "INSERT INTO apuestas_ronda (ronda_id, equipo_id, jugador_id, monto_apuesta) VALUES (?, ?, ?, ?)",
        [rondaId, equipoBId, j.jugador_id, j.apuesta || 0],
      );
    }

    await connection.commit();

    res.json({
      rondaId,
      equipoAId,
      equipoBId,
      mensaje: "Ronda creada exitosamente",
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error creando ronda:", error);
    res
      .status(500)
      .json({ error: "Error al crear ronda", detalle: error.message });
  } finally {
    connection.release();
  }
});

// Obtener detalles de una ronda
app.get("/api/ronda/:id", async (req, res) => {
  const rondaId = req.params.id;
  console.log(`📥 GET /api/ronda/${rondaId} - Solicitado`);

  try {
    // Obtener ronda
    const [rondaRows] = await db.query("SELECT * FROM rondas WHERE id = ?", [
      rondaId,
    ]);

    if (rondaRows.length === 0) {
      return res.status(404).json({ error: "Ronda no encontrada" });
    }

    const ronda = rondaRows[0];

    // Obtener equipos
    const [equiposRows] = await db.query(
      "SELECT * FROM equipos_ronda WHERE ronda_id = ?",
      [rondaId],
    );

    // Obtener apuestas
    const [apuestasRows] = await db.query(
      `SELECT ar.*, j.nombre as jugador_nombre, e.nombre_equipo
       FROM apuestas_ronda ar
       JOIN jugadores j ON ar.jugador_id = j.id
       JOIN equipos_ronda e ON ar.equipo_id = e.id
       WHERE ar.ronda_id = ?
       ORDER BY ar.id ASC`,
      [rondaId],
    );

    // Obtener enfrentamientos
    const [enfrentamientosRows] = await db.query(
      `SELECT e.*, 
              a1.monto_apuesta as monto_jugadorA,
              a2.monto_apuesta as monto_jugadorB,
              j1.nombre as nombre_jugadorA,
              j2.nombre as nombre_jugadorB,
              jg.nombre as nombre_ganador
       FROM enfrentamientos e
       LEFT JOIN apuestas_ronda a1 ON e.jugador_equipoA_id = a1.id
       LEFT JOIN apuestas_ronda a2 ON e.jugador_equipoB_id = a2.id
       LEFT JOIN jugadores j1 ON a1.jugador_id = j1.id
       LEFT JOIN jugadores j2 ON a2.jugador_id = j2.id
       LEFT JOIN apuestas_ronda ag ON e.ganador_id = ag.id
       LEFT JOIN jugadores jg ON ag.jugador_id = jg.id
       WHERE e.ronda_id = ?
       ORDER BY e.id ASC`,
      [rondaId],
    );

    res.json({
      ronda,
      equipos: equiposRows,
      apuestas: apuestasRows,
      enfrentamientos: enfrentamientosRows,
    });
  } catch (error) {
    console.error("❌ Error en /api/ronda/:id:", error);
    res
      .status(500)
      .json({ error: "Error al obtener ronda", detalle: error.message });
  }
});

// Crear enfrentamientos
app.post("/api/ronda/enfrentar", async (req, res) => {
  const { rondaId, emparejamientos } = req.body;
  console.log(
    `📥 POST /api/ronda/enfrentar - Ronda ${rondaId}, ${emparejamientos?.length} enfrentamientos`,
  );
  console.log("📦 Datos recibidos:", JSON.stringify(emparejamientos, null, 2));

  if (!rondaId || !emparejamientos || emparejamientos.length === 0) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const e of emparejamientos) {
      if (!e.jugadorA_id || !e.jugadorB_id) {
        throw new Error(
          `IDs inválidos: jugadorA_id=${e.jugadorA_id}, jugadorB_id=${e.jugadorB_id}`,
        );
      }

      await connection.query(
        `INSERT INTO enfrentamientos 
         (ronda_id, jugador_equipoA_id, jugador_equipoB_id, monto_enfrentamiento) 
         VALUES (?, ?, ?, ?)`,
        [rondaId, e.jugadorA_id, e.jugadorB_id, e.monto || 0],
      );

      console.log(
        `✅ Enfrentamiento insertado: A=${e.jugadorA_id}, B=${e.jugadorB_id}`,
      );
    }

    await connection.commit();
    console.log("✅ Todos los enfrentamientos guardados");
    res.json({
      mensaje: "Enfrentamientos creados exitosamente",
      count: emparejamientos.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error creando enfrentamientos:", error);
    res.status(500).json({
      error: "Error al crear enfrentamientos",
      detalle: error.message,
    });
  } finally {
    connection.release();
  }
});

// Finalizar ronda y calcular ganadores
app.post("/api/ronda/finalizar/:id", async (req, res) => {
  const { resultados } = req.body;
  const rondaId = req.params.id;

  console.log(
    `🏁 Finalizando ronda ${rondaId} con ${resultados?.length} resultados`,
  );

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Actualizar ganadores
    for (const r of resultados) {
      await connection.query(
        "UPDATE enfrentamientos SET ganador_id = ? WHERE id = ?",
        [r.ganador_id, r.enfrentamiento_id],
      );
    }

    // 2. Calcular movimientos
    const [movimientos] = await connection.query(
      `SELECT 
        a.jugador_id,
        a.id as apuesta_id,
        e.monto_enfrentamiento,
        CASE 
          WHEN e.ganador_id = a.id THEN 'GANADOR'
          ELSE 'PERDEDOR'
        END as resultado
      FROM enfrentamientos e
      JOIN apuestas_ronda a ON (a.id = e.jugador_equipoA_id OR a.id = e.jugador_equipoB_id)
      WHERE e.ronda_id = ? AND e.ganador_id IS NOT NULL`,
      [rondaId],
    );

    console.log("📊 Movimientos calculados:", movimientos);

    // 3. Actualizar saldos
    for (const m of movimientos) {
      const cambio =
        m.resultado === "GANADOR"
          ? m.monto_enfrentamiento
          : -m.monto_enfrentamiento;

      await connection.query(
        "UPDATE jugadores SET saldo_total = saldo_total + ? WHERE id = ?",
        [cambio, m.jugador_id],
      );
    }

    // 4. Marcar ronda como finalizada
    await connection.query(
      "UPDATE rondas SET estado = 'finalizada' WHERE id = ?",
      [rondaId],
    );

    await connection.commit();

    console.log("✅ Ronda finalizada exitosamente");
    res.json({
      mensaje: "Ronda finalizada exitosamente",
      movimientos,
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error finalizando ronda:", error);
    res
      .status(500)
      .json({ error: "Error al finalizar ronda", detalle: error.message });
  } finally {
    connection.release();
  }
});

// Listar todas las rondas
app.get("/api/rondas", async (req, res) => {
  console.log("📥 GET /api/rondas - Solicitado");

  try {
    const [rows] = await db.query(
      `SELECT r.*, 
              COUNT(DISTINCT e.id) as total_enfrentamientos,
              COUNT(DISTINCT CASE WHEN e.ganador_id IS NOT NULL THEN e.id END) as enfrentamientos_resueltos
       FROM rondas r
       LEFT JOIN enfrentamientos e ON r.id = e.ronda_id
       GROUP BY r.id
       ORDER BY r.fecha DESC`,
    );

    console.log(`✅ Enviadas ${rows.length} rondas`);
    res.json(rows);
  } catch (error) {
    console.error("❌ Error en /api/rondas:", error);
    res.status(500).json({
      error: "Error al obtener rondas",
      detalle: error.message,
    });
  }
});

// ============================================
// RUTA TEMPORAL PARA CREAR TABLAS (AGREGAR AQUÍ)
// ============================================
app.get("/api/crear-tablas", async (req, res) => {
  const connection = await db.getConnection();
  let resultado = [];

  try {
    console.log("📦 Creando tablas en Railway...");

    // Tabla jugadores
    await connection.query(`
      CREATE TABLE IF NOT EXISTS jugadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) UNIQUE NOT NULL,
        saldo_total DECIMAL(10,2) DEFAULT 0,
        activo TINYINT DEFAULT 1
      );
    `);
    resultado.push("✅ Tabla jugadores creada");

    // Tabla rondas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rondas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) DEFAULT 'activa',
        total_apuestas DECIMAL(10,2) DEFAULT 0
      );
    `);
    resultado.push("✅ Tabla rondas creada");

    // Tabla equipos_ronda
    await connection.query(`
      CREATE TABLE IF NOT EXISTS equipos_ronda (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ronda_id INT,
        nombre_equipo VARCHAR(10),
        FOREIGN KEY (ronda_id) REFERENCES rondas(id) ON DELETE CASCADE
      );
    `);
    resultado.push("✅ Tabla equipos_ronda creada");

    // Tabla apuestas_ronda
    await connection.query(`
      CREATE TABLE IF NOT EXISTS apuestas_ronda (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ronda_id INT,
        equipo_id INT,
        jugador_id INT,
        monto_apuesta DECIMAL(10,2) DEFAULT 0,
        FOREIGN KEY (ronda_id) REFERENCES rondas(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipos_ronda(id) ON DELETE CASCADE,
        FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE
      );
    `);
    resultado.push("✅ Tabla apuestas_ronda creada");

    // Tabla enfrentamientos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS enfrentamientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ronda_id INT,
        jugador_equipoA_id INT,
        jugador_equipoB_id INT,
        monto_enfrentamiento DECIMAL(10,2),
        ganador_id INT,
        FOREIGN KEY (ronda_id) REFERENCES rondas(id) ON DELETE CASCADE,
        FOREIGN KEY (jugador_equipoA_id) REFERENCES apuestas_ronda(id),
        FOREIGN KEY (jugador_equipoB_id) REFERENCES apuestas_ronda(id),
        FOREIGN KEY (ganador_id) REFERENCES apuestas_ronda(id)
      );
    `);
    resultado.push("✅ Tabla enfrentamientos creada");

    res.json({
      success: true,
      message: "Tablas creadas correctamente",
      resultado,
    });
  } catch (error) {
    console.error("❌ Error creando tablas:", error);
    res.status(500).json({
      error: error.message,
      sql: error.sql,
      code: error.code,
    });
  } finally {
    connection.release();
  }
});

// Ruta de diagnóstico
app.get("/api/diagnostico", async (req, res) => {
  try {
    const [result] = await db.query("SELECT NOW() as tiempo");
    res.json({
      status: "✅ Conexión OK",
      timestamp: result[0].tiempo,
      db: "MySQL Railway",
    });
  } catch (error) {
    console.error("❌ Error en diagnóstico:", error);
    res.status(500).json({
      status: "❌ Error de conexión",
      error: error.message,
    });
  }
});

// Ruta principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`📁 Archivos estáticos: ${path.join(__dirname, "public")}`);
  console.log(`📁 Base de datos: MySQL Railway`);
});
