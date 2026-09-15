require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());

// Aumentamos el límite de tamaño para permitir el envío de imágenes en Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// URI de conexión a MongoDB Atlas (ahora viene de una variable de entorno, nunca del código)
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ Falta la variable de entorno MONGO_URI. Define un archivo .env (en local) o configúrala en Render (en producción).');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Esquema y Modelo de Candidato - ACTUALIZADO
const CandidatoSchema = new mongoose.Schema({
  correo: { type: String, default: null },  // correo del aspirante (Firebase) que vincula su cuenta con su postulación
  nombre: { type: String, required: true },
  cargo: { type: String, required: true },
  experienciaAnos: { type: Number, required: true },
  estado: { 
    type: String, 
    enum: ['En revisión', 'Entrevistado', 'Contratado', 'Rechazado'],
    default: 'En revisión' 
  },
  fotoBase64: { type: String, default: null },
  hojaVidaBase64: { type: String, default: null },  // hoja de vida (PDF) en Base64
  hojaVidaNombre: { type: String, default: null }   // nombre original del archivo PDF
}, { timestamps: true });

CandidatoSchema.method('toJSON', function() {
  const { __v, _id, ...object } = this.toObject();
  object.id = _id;
  return object;
});

const Candidato = mongoose.model('Candidato', CandidatoSchema);

// Límite de tamaño para la hoja de vida (5 MB) y validación de que sea PDF
const MAX_HOJA_VIDA_BYTES = 5 * 1024 * 1024;

function validarHojaVida(hojaVidaBase64, hojaVidaNombre) {
  // Si no se envía hoja de vida, no hay nada que validar
  if (hojaVidaBase64 === null || hojaVidaBase64 === undefined) return null;

  if (typeof hojaVidaBase64 !== 'string' || !/^data:application\/pdf;base64,/i.test(hojaVidaBase64)) {
    return 'Solo se aceptan archivos PDF para la hoja de vida.';
  }

  // El tamaño del PDF se calcula decodificando el Base64 (sin el prefijo data:)
  const contenido = hojaVidaBase64.split(',')[1] || '';
  const tamanoBytes = Math.floor((contenido.length * 3) / 4) - (contenido.endsWith('==') ? 2 : contenido.endsWith('=') ? 1 : 0);
  if (tamanoBytes > MAX_HOJA_VIDA_BYTES) {
    return 'La hoja de vida supera el límite de 5 MB.';
  }

  if (hojaVidaNombre && !/\.pdf$/i.test(hojaVidaNombre)) {
    return 'El archivo de hoja de vida debe tener extensión .pdf';
  }

  return null;
}

// Rutas API REST (CRUD)
app.get('/api/candidatos', async (req, res) => {
  try {
    // Si se envía ?correo=..., devuelve SOLO las postulaciones de ese aspirante
    const filtro = req.query.correo ? { correo: req.query.correo } : {};
    const candidatos = await Candidato.find(filtro).sort({ createdAt: -1 });
    res.json(candidatos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener candidatos', error });
  }
});

app.post('/api/candidatos', async (req, res) => {
  try {
    console.log("📥 Datos recibidos desde la app:", req.body); // <-- Para ver qué llega exactamente

    // Validación de la hoja de vida (solo PDF y máximo 5 MB)
    const errorHojaVida = validarHojaVida(req.body.hojaVidaBase64, req.body.hojaVidaNombre);
    if (errorHojaVida) {
      return res.status(400).json({ mensaje: 'Error al crear candidato', error: errorHojaVida });
    }

    const nuevoCandidato = new Candidato(req.body);
    const candidatoGuardado = await nuevoCandidato.save();
    res.status(201).json(candidatoGuardado);
  } catch (error) {
    console.error("❌ ERROR DETALLADO AL GUARDAR:", error); // <-- Esto mostrará el error real en rojo en tu terminal
    res.status(400).json({ mensaje: 'Error al crear candidato', error: error.message });
  }
});

app.put('/api/candidatos/:id', async (req, res) => {
  try {
    // Validación de la hoja de vida (solo PDF y máximo 5 MB)
    const errorHojaVida = validarHojaVida(req.body.hojaVidaBase64, req.body.hojaVidaNombre);
    if (errorHojaVida) {
      return res.status(400).json({ mensaje: 'Error al actualizar', error: errorHojaVida });
    }

    const candidatoActualizado = await Candidato.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    res.json(candidatoActualizado);
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al actualizar', error });
  }
});

app.delete('/api/candidatos/:id', async (req, res) => {
  try {
    await Candidato.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Candidato eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar', error });
  }
});

// Render asigna el puerto automáticamente vía process.env.PORT.
// En local, si no existe esa variable, cae a 3000.
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
});