/**
 * Carga la unidad de demostración «DEMO — Torre Pacífico».
 * Se puede volver a ejecutar: borra la unidad demo anterior y la vuelve a crear.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const URL = 'https://rlnfehtgspnkyeevduli.supabase.co';
const KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsbmZlaHRnc3Bua3llZXZkdWxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzQ5MzUsImV4cCI6MjA4MDQ1MDkzNX0.8VJfcSBgGylmXrpyVR6wVTMq94P8jlRkfkZgUlvRDtY';

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const CLIENT_NAME = 'DEMO Torre Pacífico';
const CLIENT_RUC = '20608888021';
const UNIT_NAME = 'DEMO — Torre Pacífico';
const ASSETS = 'C:/Users/user/AppData/Local/Temp/opsflow-demo-photos';
const FROM = '2026-10-01';
const TO = '2026-11-30';
const HOLIDAY = '2026-10-08';

const POS = {
  supervisor: 'df910b37-e139-42c3-9611-43a13356230f',
  limpieza: '43c72353-fd73-4701-8e77-edc96af39213',
  seguridad: '0ce420b0-e842-4fab-b6e2-7ea990ea3b00',
  auxiliar: '52ef26a2-7319-414d-8a4d-3b026de4d46d',
};

const TAREO = {
  OK_TM: '6cc4b8b9-525f-4318-8256-f866cb6d1820',
  OK_TT: '7298d3a1-35d0-49d8-8032-2e3ba949e694',
  OK_TN: 'ca34fbe5-1df5-47e6-b11d-69ccb04debc4',
  DS: '4895b4d8-5596-4f4e-9363-57e871486695',
  FER: '4238fc0d-d815-43d5-abc7-912abef9b725',
  V: '0a47b417-7b05-430a-9b68-5b9516c77026',
  DM: '44400e83-039f-4576-be57-b150a6e8dc3b',
  F: '9ccfb914-fff8-4db6-9020-da587930b992',
  HE_D_25: '191e1a28-b357-44ff-bfc9-1db2b6c22f4a',
  BONO_N: '887d249c-aa5d-48fe-a2d3-57971c4f097b',
};

function must(label, result) {
  if (result.error) {
    const e = result.error;
    throw new Error(`${label}: ${e.message || e.code || JSON.stringify(e)}`);
  }
  return result.data;
}

async function chunkedInsert(table, rows, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    let q = sb.from(table).insert(chunk);
    if (select) q = q.select(select);
    const data = must(`${table} [${i}]`, await q);
    if (select) out.push(...(data || []));
    process.stdout.write(`  ${table} ${Math.min(i + 200, rows.length)}/${rows.length}\n`);
  }
  return out;
}

function eachDay(from, to) {
  const days = [];
  const d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dow(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function rangeDays(from, to) {
  return eachDay(from, to);
}

function hhmm(hour, minute, delta = 0) {
  const total = hour * 60 + minute + delta;
  const h = ((Math.floor(total / 60) % 24) + 24) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function photoUrl(filename) {
  const buf = fs.readFileSync(path.join(ASSETS, filename));
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function complementary(w) {
  return {
    version: 3,
    nombres: w.nombres,
    apellidoPaterno: w.paterno,
    apellidoMaterno: w.materno,
    fechaNacimiento: w.birth,
    tipoDocumento: 'DNI',
    nroDocumento: w.dni,
    nacionalidad: 'Peruana',
    sexo: w.sexo,
    estadoCivil: w.estadoCivil,
    email: w.email,
    telefono: w.phone,
    tallaCamisa: w.tallaCamisa,
    tallaPantalon: w.tallaPantalon,
    tallaCalzado: w.tallaCalzado,
    emergenciaTelefono: w.emergenciaTelefono,
    emergenciaParentesco: w.emergenciaParentesco,
    direccion: w.direccion,
    distrito: w.distrito,
    provincia: 'Lima',
    departamento: 'Lima',
    familiares: w.familiares,
    parienteEnOpalo: false,
    educacion: w.educacion,
    experienciaLaboral: w.experiencia,
    antecedentesSalud: w.salud,
    unidadDestaque: UNIT_NAME,
    puestoContrato: w.puesto,
    bancoSueldo: w.banco,
    numeroCuentaTrabajador: w.cuenta,
    cuentaCci: w.cci,
    bancoCts: w.bancoCts,
    jubilado: false,
    sistemaPensionesAnterior: w.afp,
    sistemaPensionesDeseado: w.afp,
    comoSeEnteroEmpleo: w.fuente,
    declaracionAceptada: true,
    submittedAt: `${w.start}T15:00:00.000Z`,
  };
}

const WORKERS = [
  {
    key: 'rosa',
    photo: 'demo-worker-rosa.jpg',
    nombres: 'Rosa Elena',
    paterno: 'Quispe',
    materno: 'Huamán',
    dni: '45821367',
    phone: '987654301',
    email: 'rosa.quispe@demo.torrepacifico.pe',
    localidad: 'San Borja, Lima',
    puesto: 'Supervisor',
    positionId: POS.supervisor,
    birth: '1988-04-12',
    start: '2024-03-04',
    end: '2027-03-03',
    shift: 'Diurno',
    roster: 'Day',
    ok: 'OK_TM',
    entry: '08:00',
    exit: '17:00',
    entryH: 8,
    entryM: 0,
    exitH: 17,
    exitM: 0,
    lunchH: 13,
    salary: 2800,
    condition: 300,
    mobility: 150,
    family: true,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Femenino',
    estadoCivil: 'Casada',
    tallaCamisa: 'M',
    tallaPantalon: '30',
    tallaCalzado: '37',
    emergenciaTelefono: '987111220',
    emergenciaParentesco: 'Esposo',
    direccion: 'Av. San Borja Norte 845, dpto. 302',
    distrito: 'San Borja',
    banco: 'BCP',
    cuenta: '19134567891012',
    cci: '00219113456789101234',
    bancoCts: 'BCP',
    afp: 'Integra',
    fuente: 'Referido por un colaborador',
    familiares: [
      { nombres: 'Mateo', apellidoPaterno: 'Quispe', apellidoMaterno: 'Rojas', parentesco: 'Hijo', edad: 9 },
      { nombres: 'Carlos', apellidoPaterno: 'Rojas', apellidoMaterno: 'Díaz', parentesco: 'Cónyuge', edad: 41, telefono: '987111220' },
    ],
    educacion: [{ nivel: 'Técnico', institucion: 'SENATI', lugar: 'Lima', periodo: '2006-2009', grado: 'Administración de servicios' }],
    experiencia: [{ empresa: 'Limpia Andina SAC', puesto: 'Supervisora de sede', fechaIngreso: '2018-02-01', fechaCese: '2024-02-28', motivoCese: 'Mejor oferta' }],
    salud: [],
    vacation: rangeDays('2026-10-19', '2026-10-23'),
    sick: [],
    absent: [],
    incomplete: [],
    late: { '2026-10-15': 8 },
    he: {},
    bonoNight: false,
    historicalVacation: 10,
    zone: 'Lobby',
    functions: 'Coordina al equipo de la sede, abre novedades del día y recibe al cliente en el lobby.',
    experienceText: 'Ocho años supervisando servicios generales en edificios de oficinas.',
    message: 'Si algo se sale del estándar, lo vemos juntos antes de que llegue al cliente.',
    trainings: [
      { topic: 'Inducción SST y uso de EPP', date: '2024-03-06', status: 'Completado', score: 18 },
      { topic: 'Liderazgo de equipos de servicio', date: '2025-08-14', status: 'Completado', score: 17 },
      { topic: 'Atención al usuario en edificios corporativos', date: '2026-04-09', status: 'Completado', score: 19 },
    ],
    assets: [
      { name: 'Radio portátil', type: 'Tecnologia', serial: 'RAD-TP-014', date: '2024-03-04' },
      { name: 'Llaves maestras de pisos pares', type: 'Otro', serial: 'LLV-TP-02', date: '2024-03-04' },
    ],
    contracts: [
      { n: 1, start: '2024-03-04', end: '2025-03-03', status: 'renovado', salary: 2500, condition: 250 },
      { n: 2, start: '2025-03-04', end: '2026-03-03', status: 'renovado', salary: 2650, condition: 280 },
      { n: 3, start: '2026-03-04', end: '2027-03-03', status: 'activo', salary: 2800, condition: 300 },
    ],
  },
  {
    key: 'luis',
    photo: 'demo-worker-luis.jpg',
    nombres: 'Luis Alberto',
    paterno: 'Mendoza',
    materno: 'Ríos',
    dni: '47289015',
    phone: '987654302',
    email: 'luis.mendoza@demo.torrepacifico.pe',
    localidad: 'Los Olivos, Lima',
    puesto: 'Operario de Limpieza',
    positionId: POS.limpieza,
    birth: '1996-09-02',
    start: '2025-01-13',
    end: '2027-01-12',
    shift: 'Diurno',
    roster: 'Day',
    ok: 'OK_TM',
    entry: '07:00',
    exit: '15:00',
    entryH: 7,
    entryM: 0,
    exitH: 15,
    exitM: 0,
    lunchH: 12,
    salary: 1650,
    condition: 180,
    mobility: 80,
    family: false,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Masculino',
    estadoCivil: 'Soltero',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaCalzado: '42',
    emergenciaTelefono: '984220118',
    emergenciaParentesco: 'Madre',
    direccion: 'Jr. Las Gardenias 412, Los Olivos',
    distrito: 'Los Olivos',
    banco: 'Interbank',
    cuenta: '20030874521',
    cci: '00320001308745210018',
    bancoCts: 'Interbank',
    afp: 'Prima',
    fuente: 'Bolsa de trabajo',
    familiares: [{ nombres: 'Elena', apellidoPaterno: 'Ríos', apellidoMaterno: 'Paredes', parentesco: 'Madre', edad: 58, telefono: '984220118' }],
    educacion: [{ nivel: 'Secundaria completa', institucion: 'I.E. 2050', lugar: 'Los Olivos', periodo: '2008-2012', grado: 'Educación básica' }],
    experiencia: [{ empresa: 'Servicios del Norte EIRL', puesto: 'Operario de limpieza', fechaIngreso: '2021-04-01', fechaCese: '2024-12-15', motivoCese: 'Fin de contrato' }],
    salud: [],
    vacation: [],
    sick: [],
    absent: ['2026-11-18'],
    incomplete: [],
    late: { '2026-11-05': 14 },
    he: {},
    bonoNight: false,
    historicalVacation: 6,
    zone: 'Pisos 1 al 6',
    functions: 'Limpieza de oficinas y servicios higiénicos de los pisos 1 al 6, incluyendo reposición de insumos.',
    experienceText: 'Cuatro años en limpieza de oficinas y áreas comunes.',
    message: 'Dejo los pisos bajos listos antes de las 10, para no cruzarme con las reuniones.',
    trainings: [
      { topic: 'Inducción SST y uso de EPP', date: '2025-01-14', status: 'Completado', score: 16 },
      { topic: 'Manejo de productos químicos de limpieza', date: '2025-05-20', status: 'Completado', score: 18 },
    ],
    assets: [
      { name: 'Carro de limpieza', type: 'Herramienta', serial: 'CAR-TP-07', date: '2025-01-13' },
      { name: 'Uniforme de sede (2 mudas)', type: 'Uniforme', serial: 'UNI-TP-L-07', date: '2025-01-13' },
    ],
    contracts: [{ n: 1, start: '2025-01-13', end: '2027-01-12', status: 'activo', salary: 1650, condition: 180 }],
    increment: { previous: 1500, next: 1650, date: '2026-07-01', notes: 'Incremento por evaluación semestral' },
  },
  {
    key: 'maria',
    photo: 'demo-worker-maria.jpg',
    nombres: 'María Fernanda',
    paterno: 'Castillo',
    materno: 'Vega',
    dni: '70124588',
    phone: '987654303',
    email: 'maria.castillo@demo.torrepacifico.pe',
    localidad: 'Surquillo, Lima',
    puesto: 'Operario de Limpieza',
    positionId: POS.limpieza,
    birth: '1999-11-21',
    start: '2025-06-02',
    end: '2027-06-01',
    shift: 'Diurno',
    roster: 'Day',
    ok: 'OK_TM',
    entry: '07:00',
    exit: '15:00',
    entryH: 7,
    entryM: 0,
    exitH: 15,
    exitM: 0,
    lunchH: 12,
    salary: 1600,
    condition: 180,
    mobility: 80,
    family: false,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Femenino',
    estadoCivil: 'Soltera',
    tallaCamisa: 'S',
    tallaPantalon: '28',
    tallaCalzado: '36',
    emergenciaTelefono: '993441207',
    emergenciaParentesco: 'Hermana',
    direccion: 'Calle González Prada 1180, Surquillo',
    distrito: 'Surquillo',
    banco: 'BBVA',
    cuenta: '001104580200345678',
    cci: '01111400020034567890',
    bancoCts: 'BBVA',
    afp: 'Habitat',
    fuente: 'Convocatoria de la sede',
    familiares: [{ nombres: 'Lucía', apellidoPaterno: 'Castillo', apellidoMaterno: 'Vega', parentesco: 'Hermana', edad: 24, telefono: '993441207' }],
    educacion: [{ nivel: 'Técnico', institucion: 'Instituto San Ignacio de Loyola', lugar: 'Lima', periodo: '2018-2020', grado: 'Administración incompleta' }],
    experiencia: [{ empresa: 'Hotel Costa Real', puesto: 'Camarera de pisos', fechaIngreso: '2022-01-10', fechaCese: '2025-05-20', motivoCese: 'Renuncia voluntaria' }],
    salud: [],
    vacation: [],
    sick: [],
    absent: [],
    incomplete: ['2026-11-10'],
    late: {},
    he: { '2026-10-17': 2, '2026-11-07': 2, '2026-11-21': 2 },
    bonoNight: false,
    historicalVacation: 4,
    zone: 'Pisos 7 al 14',
    functions: 'Limpieza de oficinas de los pisos 7 al 14 y apoyo con la fregadora los sábados.',
    experienceText: 'Tres años en hotelería y un año en edificios corporativos.',
    message: 'Los sábados dejo el hall de ascensores brillando antes del mediodía.',
    trainings: [
      { topic: 'Inducción SST y uso de EPP', date: '2025-06-03', status: 'Completado', score: 17 },
      { topic: 'Uso de fregadora compacta', date: '2025-09-11', status: 'Completado', score: 18 },
    ],
    assets: [{ name: 'Radio portátil', type: 'Tecnologia', serial: 'RAD-TP-021', date: '2025-06-02' }],
    contracts: [{ n: 1, start: '2025-06-02', end: '2027-06-01', status: 'activo', salary: 1600, condition: 180 }],
    variable: { month: '2026-10', amount: 120, concept: 'Productividad de sede', payment: '2026-11-05' },
  },
  {
    key: 'jose',
    photo: 'demo-worker-jose.jpg',
    nombres: 'José Antonio',
    paterno: 'Paredes',
    materno: 'Silva',
    dni: '41567823',
    phone: '987654304',
    email: 'jose.paredes@demo.torrepacifico.pe',
    localidad: 'San Martín de Porres, Lima',
    puesto: 'Operario de Limpieza',
    positionId: POS.limpieza,
    birth: '1991-02-08',
    start: '2024-11-18',
    end: '2027-11-17',
    shift: 'Tarde',
    roster: 'Afternoon',
    ok: 'OK_TT',
    entry: '15:00',
    exit: '23:00',
    entryH: 15,
    entryM: 0,
    exitH: 23,
    exitM: 0,
    lunchH: 19,
    salary: 1680,
    condition: 180,
    mobility: 90,
    family: true,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Masculino',
    estadoCivil: 'Casado',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaCalzado: '41',
    emergenciaTelefono: '976330214',
    emergenciaParentesco: 'Esposa',
    direccion: 'Av. Perú 2340, San Martín de Porres',
    distrito: 'San Martín de Porres',
    banco: 'BCP',
    cuenta: '19400022118765',
    cci: '00219400022118765011',
    bancoCts: 'Scotiabank',
    afp: 'Profuturo',
    fuente: 'Referido',
    familiares: [
      { nombres: 'Andrea', apellidoPaterno: 'Paredes', apellidoMaterno: 'Silva', parentesco: 'Hija', edad: 6 },
      { nombres: 'Fiorella', apellidoPaterno: 'Silva', apellidoMaterno: 'Campos', parentesco: 'Cónyuge', edad: 32, telefono: '976330214' },
    ],
    educacion: [{ nivel: 'Secundaria completa', institucion: 'I.E. Alfonso Ugarte', lugar: 'SMP', periodo: '2003-2007', grado: 'Educación básica' }],
    experiencia: [{ empresa: 'Facilities Lima SAC', puesto: 'Operario de turno tarde', fechaIngreso: '2019-03-01', fechaCese: '2024-10-31', motivoCese: 'Mejor oferta' }],
    salud: [{ tipoEnfermedad: 'Gripe', edad: 34, diagnostico: 'Cuadro viral', secuela: 'Ninguna' }],
    vacation: [],
    sick: ['2026-11-12'],
    absent: [],
    incomplete: [],
    late: { '2026-11-06': 9 },
    he: {},
    bonoNight: false,
    historicalVacation: 12,
    zone: 'Pisos 1 al 6',
    functions: 'Cierre de limpieza del turno tarde en pisos bajos, lobby y servicios higiénicos.',
    experienceText: 'Seis años en turno tarde de edificios de oficinas.',
    message: 'A las 22:30 el lobby ya queda libre para el control de acceso.',
    trainings: [
      { topic: 'Inducción SST y uso de EPP', date: '2024-11-19', status: 'Completado', score: 16 },
      { topic: 'Manejo de productos químicos de limpieza', date: '2025-03-12', status: 'Completado', score: 15 },
    ],
    assets: [{ name: 'Uniforme de sede (2 mudas)', type: 'Uniforme', serial: 'UNI-TP-J-04', date: '2024-11-18' }],
    contracts: [
      { n: 1, start: '2024-11-18', end: '2025-11-17', status: 'renovado', salary: 1550, condition: 150 },
      { n: 2, start: '2025-11-18', end: '2027-11-17', status: 'activo', salary: 1680, condition: 180 },
    ],
  },
  {
    key: 'carmen',
    photo: 'demo-worker-carmen.jpg',
    nombres: 'Carmen Lucía',
    paterno: 'Torres',
    materno: 'Aguilar',
    dni: '46771290',
    phone: '987654305',
    email: 'carmen.torres@demo.torrepacifico.pe',
    localidad: 'Magdalena del Mar, Lima',
    puesto: 'Auxiliar de Mantenimiento',
    positionId: POS.auxiliar,
    birth: '1994-07-15',
    start: '2026-11-02',
    end: '2027-05-01',
    shift: 'Tarde',
    roster: 'Afternoon',
    ok: 'OK_TT',
    entry: '15:00',
    exit: '23:00',
    entryH: 15,
    entryM: 0,
    exitH: 23,
    exitM: 0,
    lunchH: 19,
    salary: 1700,
    condition: 200,
    mobility: 90,
    family: false,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Femenino',
    estadoCivil: 'Conviviente',
    tallaCamisa: 'M',
    tallaPantalon: '30',
    tallaCalzado: '38',
    emergenciaTelefono: '991208334',
    emergenciaParentesco: 'Conviviente',
    direccion: 'Jr. Junín 560, Magdalena del Mar',
    distrito: 'Magdalena del Mar',
    banco: 'Scotiabank',
    cuenta: '000445219876',
    cci: '00904400004452198761',
    bancoCts: 'Scotiabank',
    afp: 'Integra',
    fuente: 'Recomendación del coordinador',
    familiares: [{ nombres: 'Raúl', apellidoPaterno: 'Gómez', apellidoMaterno: 'León', parentesco: 'Conviviente', edad: 36, telefono: '991208334' }],
    educacion: [{ nivel: 'Técnico', institucion: 'TECSUP', lugar: 'Lima', periodo: '2013-2015', grado: 'Mantenimiento de instalaciones' }],
    experiencia: [{ empresa: 'Edificios del Centro SAC', puesto: 'Auxiliar de mantenimiento', fechaIngreso: '2019-08-01', fechaCese: '2026-10-15', motivoCese: 'Renuncia voluntaria' }],
    salud: [],
    vacation: [],
    sick: [],
    absent: [],
    incomplete: [],
    late: {},
    he: {},
    bonoNight: false,
    historicalVacation: 0,
    zone: 'Servicios higiénicos',
    functions: 'Apoya el turno tarde con mantenimiento menor: luminarias, dispensadores y reporte de fallas.',
    experienceText: 'Siete años en mantenimiento de edificios comerciales.',
    message: 'Si una luminaria parpadea, la dejo reportada el mismo día.',
    trainings: [{ topic: 'Inducción SST y uso de EPP', date: '2026-11-03', status: 'Completado', score: 18 }],
    assets: [{ name: 'Juego de herramientas básico', type: 'Herramienta', serial: 'HER-TP-03', date: '2026-11-02' }],
    contracts: [{ n: 1, start: '2026-11-02', end: '2027-05-01', status: 'activo', salary: 1700, condition: 200 }],
  },
  {
    key: 'diego',
    photo: 'demo-worker-diego.jpg',
    nombres: 'Diego Armando',
    paterno: 'Salazar',
    materno: 'Núñez',
    dni: '40991276',
    phone: '987654306',
    email: 'diego.salazar@demo.torrepacifico.pe',
    localidad: 'Callao',
    puesto: 'Seguridad',
    positionId: POS.seguridad,
    birth: '1985-12-03',
    start: '2023-08-01',
    end: '2027-07-31',
    shift: 'Nocturno',
    roster: 'Night',
    ok: 'OK_TN',
    entry: '23:00',
    exit: '07:00',
    entryH: 23,
    entryM: 0,
    exitH: 7,
    exitM: 0,
    lunchH: 2,
    salary: 1900,
    condition: 250,
    mobility: 120,
    family: true,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Masculino',
    estadoCivil: 'Casado',
    tallaCamisa: 'XL',
    tallaPantalon: '36',
    tallaCalzado: '43',
    emergenciaTelefono: '989100442',
    emergenciaParentesco: 'Esposa',
    direccion: 'Av. Sáenz Peña 890, Callao',
    distrito: 'Callao',
    banco: 'BCP',
    cuenta: '19377654001288',
    cci: '00219317765400128844',
    bancoCts: 'BCP',
    afp: 'Prima',
    fuente: 'Bolsa de trabajo',
    familiares: [
      { nombres: 'Valeria', apellidoPaterno: 'Salazar', apellidoMaterno: 'Núñez', parentesco: 'Hija', edad: 11 },
      { nombres: 'Patricia', apellidoPaterno: 'Núñez', apellidoMaterno: 'Olaya', parentesco: 'Cónyuge', edad: 40, telefono: '989100442' },
    ],
    educacion: [{ nivel: 'Técnico', institucion: 'Escuela de Seguridad Ciudadana', lugar: 'Lima', periodo: '2009-2010', grado: 'Agente de seguridad' }],
    experiencia: [{ empresa: 'Vigilancia Pacífico SAC', puesto: 'Agente de control de acceso', fechaIngreso: '2016-01-04', fechaCese: '2023-07-20', motivoCese: 'Mejor oferta' }],
    salud: [],
    vacation: [],
    sick: [],
    absent: [],
    incomplete: [],
    late: { '2026-11-09': 11 },
    he: {},
    bonoNight: true,
    historicalVacation: 18,
    zone: 'Ingreso y estacionamiento',
    functions: 'Control de acceso nocturno, rondas de sótano y estacionamiento, y cierre de novedades al amanecer.',
    experienceText: 'Diez años en control de acceso de torres de oficinas.',
    message: 'La ronda de las 3 a.m. es la que evita sorpresas en el sótano.',
    trainings: [
      { topic: 'Inducción SST y uso de EPP', date: '2023-08-02', status: 'Completado', score: 17 },
      { topic: 'Control de acceso y rondas', date: '2024-02-16', status: 'Completado', score: 19 },
      { topic: 'Primeros auxilios básicos', date: '2025-11-07', status: 'Completado', score: 16 },
    ],
    assets: [
      { name: 'Radio portátil', type: 'Tecnologia', serial: 'RAD-TP-003', date: '2023-08-01' },
      { name: 'Linterna de ronda', type: 'EPP', serial: 'LIN-TP-003', date: '2023-08-01' },
    ],
    contracts: [
      { n: 1, start: '2023-08-01', end: '2025-07-31', status: 'renovado', salary: 1700, condition: 200 },
      { n: 2, start: '2025-08-01', end: '2027-07-31', status: 'activo', salary: 1900, condition: 250 },
    ],
    variable: { month: '2026-10', amount: 80, concept: 'Bono de asistencia nocturna', payment: '2026-11-05' },
  },
  {
    key: 'miguel',
    photo: 'demo-worker-miguel.jpg',
    nombres: 'Miguel Ángel',
    paterno: 'Ramos',
    materno: 'Delgado',
    dni: '43220981',
    phone: '987654307',
    email: 'miguel.ramos@demo.torrepacifico.pe',
    localidad: 'Breña, Lima',
    puesto: 'Operario de Limpieza',
    positionId: POS.limpieza,
    birth: '1993-05-19',
    start: '2025-03-01',
    end: '2026-11-03',
    shift: 'Diurno',
    roster: 'Day',
    ok: 'OK_TM',
    entry: '07:00',
    exit: '15:00',
    entryH: 7,
    entryM: 0,
    exitH: 15,
    exitM: 0,
    lunchH: 12,
    salary: 1580,
    condition: 160,
    mobility: 80,
    family: false,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sexo: 'Masculino',
    estadoCivil: 'Soltero',
    tallaCamisa: 'M',
    tallaPantalon: '32',
    tallaCalzado: '41',
    emergenciaTelefono: '985667120',
    emergenciaParentesco: 'Padre',
    direccion: 'Jr. Zorritos 340, Breña',
    distrito: 'Breña',
    banco: 'Interbank',
    cuenta: '20011993440',
    cci: '00320001119934400022',
    bancoCts: 'Interbank',
    afp: 'Habitat',
    fuente: 'Convocatoria',
    familiares: [],
    educacion: [{ nivel: 'Secundaria completa', institucion: 'I.E. Mercedes Cabello', lugar: 'Breña', periodo: '2005-2009', grado: 'Educación básica' }],
    experiencia: [],
    salud: [],
    vacation: [],
    sick: [],
    absent: [],
    incomplete: [],
    late: {},
    he: {},
    bonoNight: false,
    historicalVacation: 5,
    archived: true,
    terminationReason: 'Renuncia voluntaria',
    terminationDetail: 'Renunció para trasladarse a otra ciudad. Último día laborado el 3 de noviembre de 2026.',
    zone: 'Pisos 1 al 6',
    trainings: [{ topic: 'Inducción SST y uso de EPP', date: '2025-03-03', status: 'Completado', score: 15 }],
    assets: [],
    contracts: [{ n: 1, start: '2025-03-01', end: '2026-11-03', status: 'finalizado', salary: 1580, condition: 160 }],
  },
];

function dayPlan(worker, day) {
  if (day < worker.start) return null;
  if (worker.archived && day > worker.end) return null;
  const sunday = dow(day) === 0;
  const holiday = day === HOLIDAY;
  const vacation = worker.vacation.includes(day);
  const sick = worker.sick.includes(day);
  const absent = worker.absent.includes(day);
  const incomplete = worker.incomplete.includes(day);
  const late = worker.late[day] || 0;
  const he = worker.he[day] || 0;

  if (sunday) {
    return { roster: 'OFF', hours: 0, tareo: 'DS', comment: 'Descanso semanal' };
  }
  if (holiday) {
    return { roster: 'OFF', hours: 0, tareo: 'FER', comment: 'Combate de Angamos' };
  }
  if (vacation) {
    return { roster: 'Vacation', hours: 0, tareo: 'V', comment: 'Vacaciones programadas' };
  }
  if (sick) {
    return { roster: 'Sick', hours: 0, tareo: 'DM', comment: 'Descanso médico con CITT' };
  }

  const plan = {
    roster: worker.roster,
    hours: 8,
    start: worker.entry,
    end: worker.exit,
    tareo: worker.ok,
    hoursKey: null,
    hoursValue: null,
  };
  if (absent) {
    plan.tareo = 'F';
    plan.mark = 'none';
    plan.comment = 'No se presentó ni comunicó cobertura';
    return plan;
  }
  if (he) {
    plan.hoursKey = 'HE_D_25';
    plan.hoursValue = he;
    plan.comment = `Horas extra diurnas 25% (${he} h) por apoyo de sábado`;
  }
  if (worker.bonoNight) {
    plan.hoursKey = 'BONO_N';
    plan.hoursValue = 2;
  }
  plan.mark = incomplete ? 'partial' : 'complete';
  plan.late = late;
  return plan;
}

async function cleanup() {
  const oldUnits = must('buscar unidad demo', await sb.from('units').select('id').eq('name', UNIT_NAME));
  for (const unit of oldUnits || []) {
    must('borrar unidad demo previa', await sb.from('units').delete().eq('id', unit.id));
  }
  const oldStaff = must(
    'buscar staff demo',
    await sb.from('management_staff').select('id').like('email', '%@demo.torrepacifico.pe')
  );
  for (const staff of oldStaff || []) {
    must('borrar staff demo', await sb.from('management_staff').delete().eq('id', staff.id));
  }
  const oldClients = must('buscar cliente demo', await sb.from('clients').select('id').eq('name', CLIENT_NAME));
  for (const client of oldClients || []) {
    must('borrar cliente demo', await sb.from('clients').delete().eq('id', client.id));
  }
}

async function main() {
  console.log('Limpiando demo anterior…');
  await cleanup();

  console.log('Preparando fotos…');
  const photos = {};
  const files = {
    exterior: 'demo-torre-exterior.jpg',
    lobby: 'demo-torre-lobby.jpg',
    pasillo: 'demo-pasillo-limpio.jpg',
    patricia: 'demo-coord-patricia.jpg',
    ricardo: 'demo-supervisor-ricardo.jpg',
  };
  for (const worker of WORKERS) {
    if (worker.photo) files[worker.key] = worker.photo;
  }
  for (const [key, file] of Object.entries(files)) {
    photos[key] = photoUrl(file);
    console.log('  ', key, Math.round(photos[key].length / 1024), 'KB');
  }

  console.log('Cliente y equipo…');
  const client = must(
    'cliente',
    await sb
      .from('clients')
      .insert({ name: CLIENT_NAME, ruc: CLIENT_RUC })
      .select('id')
      .single()
  );
  must(
    'representante',
    await sb.from('client_representatives').insert({
      client_id: client.id,
      name: 'Lucía Herrera Vidal',
      phone: '51987654010',
      email: 'lucia.herrera@demo.torrepacifico.pe',
    })
  );

  const patricia = must(
    'coordinadora',
    await sb
      .from('management_staff')
      .insert({
        name: 'Patricia Elena Vargas Soto',
        role: 'COORDINATOR',
        email: 'patricia.vargas@demo.torrepacifico.pe',
        phone: '987650101',
        photo: photos.patricia,
        dni: '40112233',
        start_date: '2022-01-10',
        status: 'activo',
        archived: false,
      })
      .select('id')
      .single()
  );
  const ricardo = must(
    'supervisor de ronda',
    await sb
      .from('management_staff')
      .insert({
        name: 'Ricardo Omar Flores Peña',
        role: 'ROVING_SUPERVISOR',
        email: 'ricardo.flores@demo.torrepacifico.pe',
        phone: '987650102',
        photo: photos.ricardo,
        dni: '42880011',
        start_date: '2021-06-01',
        status: 'activo',
        archived: false,
      })
      .select('id')
      .single()
  );

  const unit = must(
    'unidad',
    await sb
      .from('units')
      .insert({
        name: UNIT_NAME,
        client_name: CLIENT_NAME,
        address: 'Av. Jorge Basadre 347, San Isidro, Lima',
        status: 'Activo',
        unit_class: 'STANDARD',
        description:
          'Servicio integral de limpieza, mantenimiento menor y control de acceso en una torre de oficinas de 14 pisos. Sede armada para demostración, con personal, asistencia y tareo de octubre y noviembre 2026.',
        latitude: -12.0974,
        longitude: -77.0326,
        coordinator_id: patricia.id,
        roving_supervisor_id: ricardo.id,
        multi_employer: false,
        required_positions: [
          { positionId: POS.supervisor, positionName: 'Supervisor', quantity: 1, shift: 'Day' },
          { positionId: POS.limpieza, positionName: 'Operario de Limpieza', quantity: 2, shift: 'Day' },
          { positionId: POS.limpieza, positionName: 'Operario de Limpieza', quantity: 1, shift: 'Afternoon' },
          { positionId: POS.auxiliar, positionName: 'Auxiliar de Mantenimiento', quantity: 1, shift: 'Afternoon' },
          { positionId: POS.seguridad, positionName: 'Seguridad', quantity: 1, shift: 'Night' },
        ],
        headcount_meta: [
          { positionId: POS.supervisor, preventivo: { Day: 1 }, observaciones: 'Supervisión residente en horario de oficina.' },
          { positionId: POS.limpieza, preventivo: { Day: 2, Afternoon: 1 }, observaciones: 'Dos en la mañana (pisos bajos y altos) y uno de cierre en la tarde.' },
          { positionId: POS.auxiliar, preventivo: { Afternoon: 1 }, observaciones: 'Mantenimiento menor en el turno tarde.' },
          { positionId: POS.seguridad, preventivo: { Night: 1 }, observaciones: 'Control de acceso y ronda de sótano.' },
        ],
      })
      .select('id')
      .single()
  );

  must(
    'staff de la unidad',
    await sb.from('unit_management_staff').insert([
      { unit_id: unit.id, management_staff_id: patricia.id },
      { unit_id: unit.id, management_staff_id: ricardo.id },
    ])
  );

  must(
    'fotos de la sede',
    await sb.from('unit_images').insert([
      { unit_id: unit.id, image_url: photos.exterior, display_order: 0 },
      { unit_id: unit.id, image_url: photos.lobby, display_order: 1 },
      { unit_id: unit.id, image_url: photos.pasillo, display_order: 2 },
    ])
  );

  const layer = must(
    'plano',
    await sb.from('blueprint_layers').insert({ unit_id: unit.id, name: 'Piso tipo' }).select('id').single()
  );
  const sotano = must(
    'sótano',
    await sb.from('blueprint_layers').insert({ unit_id: unit.id, name: 'Sótano y exteriores' }).select('id').single()
  );

  const zoneRows = [
    ['Lobby', 180, 1, 1, 4, 3, '#dbeafe', layer.id, ['Turno Mañana', 'Turno Tarde']],
    ['Pisos 1 al 6', 2400, 5, 1, 4, 4, '#dcfce7', layer.id, ['Turno Mañana', 'Turno Tarde']],
    ['Pisos 7 al 14', 3100, 9, 1, 4, 4, '#fef3c7', layer.id, ['Turno Mañana']],
    ['Servicios higiénicos', 220, 1, 5, 4, 2, '#f3e8ff', layer.id, ['Turno Mañana', 'Turno Tarde']],
    ['Ingreso y estacionamiento', 900, 1, 1, 6, 4, '#e2e8f0', sotano.id, ['Turno Noche']],
    ['Exteriores', 400, 7, 1, 5, 3, '#ffedd5', sotano.id, ['Turno Mañana']],
  ];
  const zones = [];
  for (const [name, area, x, y, w, h, color, layerId, shifts] of zoneRows) {
    const zone = must(
      `zona ${name}`,
      await sb
        .from('zones')
        .insert({
          unit_id: unit.id,
          name,
          area,
          layout_x: x,
          layout_y: y,
          layout_w: w,
          layout_h: h,
          layout_color: color,
          layout_layer_id: layerId,
        })
        .select('id, name')
        .single()
    );
    must(
      `turnos ${name}`,
      await sb.from('zone_shifts').insert(shifts.map((shift_name) => ({ zone_id: zone.id, shift_name })))
    );
    zones.push(zone);
  }
  const zoneId = Object.fromEntries(zones.map((z) => [z.name, z.id]));

  must(
    'cumplimiento',
    await sb.from('compliance_history').insert(
      [
        ['Jun', 92],
        ['Jul', 94],
        ['Ago', 91],
        ['Set', 96],
        ['Oct', 95],
        ['Nov', 97],
      ].map(([month, score]) => ({ unit_id: unit.id, month, score }))
    )
  );

  console.log('Personal…');
  const ids = {};
  for (const worker of WORKERS) {
    const active = !worker.archived;
    const row = must(
      worker.key,
      await sb
        .from('resources')
        .insert({
          unit_id: unit.id,
          name: `${worker.nombres} ${worker.paterno} ${worker.materno}`,
          type: 'Personal',
          quantity: 1,
          status: 'Activo',
          assigned_shift: worker.shift,
          compliance_percentage: active ? (worker.key === 'luis' ? 93 : 97) : 100,
          image: photos[worker.key] || null,
          dni: worker.dni,
          localidad: worker.localidad,
          phone: worker.phone,
          email: worker.email,
          puesto: worker.puesto,
          birth_date: worker.birth,
          start_date: worker.start,
          end_date: worker.end,
          personnel_status: active ? 'activo' : 'cesado',
          archived: !!worker.archived,
          termination_reason: worker.terminationReason || null,
          termination_detail: worker.terminationDetail || null,
          is_shared: false,
          in_training: false,
          contract_generated: true,
          monthly_salary: worker.salary,
          work_condition_amount: worker.condition,
          work_days: worker.days,
          entry_time: worker.entry,
          exit_time: worker.exit,
          jornada_type: 'Full Time',
          labor_regime: 'General',
          mobility_bonus: worker.mobility,
          family_allowance: worker.family,
          employer_company_code: 103,
          inbound_source_data: {
            complementary: complementary(worker),
            meta: {
              snapshotVersion: 3,
              complementaryStatus: 'complete',
              complementaryFilledAt: `${worker.start}T15:00:00.000Z`,
              sourceApp: 'demo',
            },
          },
        })
        .select('id')
        .single()
    );
    ids[worker.key] = row.id;
    if (worker.zone && zoneId[worker.zone]) {
      must(
        `zona de ${worker.key}`,
        await sb.from('resource_zone_assignments').insert({ resource_id: row.id, zone_id: zoneId[worker.zone] })
      );
    }
  }

  const machine = must(
    'fregadora',
    await sb
      .from('resources')
      .insert({
        unit_id: unit.id,
        name: 'Fregadora de pisos compacta',
        type: 'Equipos/Maquinaria',
        quantity: 1,
        status: 'Operativo',
        image: photos.pasillo,
        next_maintenance: '2026-12-15',
        external_id: 'FRG-TP-01',
      })
      .select('id')
      .single()
  );
  must(
    'insumos',
    await sb.from('resources').insert({
      unit_id: unit.id,
      name: 'Papel higiénico y jabón de manos',
      type: 'Materiales/Insumos',
      quantity: 48,
      unit_of_measure: 'Paquetes',
      status: 'Stock OK',
      last_restock: '2026-11-20',
    })
  );

  console.log('Contratos, capacitación y activos…');
  const contracts = [];
  const trainings = [];
  const assets = [];
  const increments = [];
  for (const worker of WORKERS) {
    const resourceId = ids[worker.key];
    for (const c of worker.contracts) {
      contracts.push({
        resource_id: resourceId,
        contract_number: c.n,
        start_date: c.start,
        end_date: c.end,
        status: c.status,
        monthly_salary: c.salary,
        work_condition_amount: c.condition,
        notes: c.n === 1 ? 'Contrato inicial en la sede demo' : 'Renovación',
      });
    }
    for (const t of worker.trainings) {
      trainings.push({ resource_id: resourceId, topic: t.topic, date: t.date, status: t.status, score: t.score });
    }
    for (const a of worker.assets) {
      assets.push({
        resource_id: resourceId,
        name: a.name,
        type: a.type,
        serial_number: a.serial,
        date_assigned: a.date,
        notes: 'Entregado en la sede Torre Pacífico',
      });
    }
    if (worker.increment) {
      increments.push({
        resource_id: resourceId,
        previous_salary: worker.increment.previous,
        new_salary: worker.increment.next,
        increment_date: worker.increment.date,
        effective_date: worker.increment.date,
        notes: worker.increment.notes,
      });
    }
  }
  await chunkedInsert('contract_history', contracts);
  await chunkedInsert('trainings', trainings);
  if (assets.length) await chunkedInsert('assigned_assets', assets);
  if (increments.length) await chunkedInsert('salary_increments', increments);

  const variables = WORKERS.filter((w) => w.variable).map((w) => ({
    unit_id: unit.id,
    resource_id: ids[w.key],
    period_month: `${w.variable.month}-01`,
    amount: w.variable.amount,
    concept: w.variable.concept,
    payment_date: w.variable.payment,
    notes: 'Registrado para la demostración de octubre 2026',
    source: 'manual',
  }));
  await chunkedInsert('variable_compensations', variables);

  console.log('Roster, tareo y asistencia…');
  const shifts = [];
  const novedades = [];
  const markDrafts = [];
  for (const worker of WORKERS) {
    for (const day of eachDay(FROM, TO)) {
      const plan = dayPlan(worker, day);
      if (!plan) continue;
      const shift = {
        resource_id: ids[worker.key],
        date: day,
        type: plan.roster,
        hours: plan.hours,
      };
      if (plan.hours > 0) {
        shift.start_time = plan.start;
        shift.end_time = plan.end;
      }
      shifts.push(shift);
      const novedad = {
        unit_id: unit.id,
        resource_id: ids[worker.key],
        day,
        day_key_id: TAREO[plan.tareo],
        hours_key_id: plan.hoursKey ? TAREO[plan.hoursKey] : null,
        hours_value: plan.hoursValue ?? null,
        comment: plan.comment || null,
        source: 'manual',
        updated_by: 'Demo OpsFlow',
      };
      novedades.push(novedad);
      if (!plan.mark) continue;
      const name = `${worker.nombres} ${worker.paterno} ${worker.materno}`;
      if (plan.mark === 'none') {
        markDrafts.push({
          worker,
          day,
          name,
          attendance_status: 'Sin marcas',
          minutes_late: null,
          punch_arrival: 'No marco',
          punch_lunch_out: 'No marco',
          punch_lunch_in: 'No marco',
          punch_departure: 'No marco',
          notes: plan.comment,
          user_comment: 'Se registró como falta injustificada en el tareo.',
        });
        continue;
      }
      const late = plan.late || 0;
      const arrival = hhmm(worker.entryH, worker.entryM, late ? late : -4);
      const lunchOut = hhmm(worker.lunchH, 2, 0);
      const lunchIn = hhmm(worker.lunchH, 48, 0);
      const departure = hhmm(worker.exitH, worker.exitM, 4);
      markDrafts.push({
        worker,
        day,
        name,
        attendance_status: plan.mark === 'partial' ? 'Marcación incompleta' : 'Marcación completa',
        minutes_late: late || null,
        punch_arrival: arrival,
        punch_lunch_out: lunchOut,
        punch_lunch_in: plan.mark === 'partial' ? 'No marco' : lunchIn,
        punch_departure: plan.mark === 'partial' ? 'No marco' : departure,
        notes: late ? `Tardanza de ${late} minutos` : plan.comment || null,
        user_comment: plan.mark === 'partial' ? 'Salió a una comisión del piso 12 y no marcó el retorno.' : null,
      });
    }
  }
  await chunkedInsert('daily_shifts', shifts);
  await chunkedInsert('attendance_tareo_novedades', novedades);

  const octoberImport = must(
    'import octubre',
    await sb
      .from('attendance_report_imports')
      .insert({
        unit_id: unit.id,
        report_date: '2026-10-31',
        source_filename: 'DEMO Asistencia Torre Pacifico Octubre 2026.xlsx',
        sheet_used: 'Octubre',
        uploaded_by: null,
        column_mapping: {},
      })
      .select('id')
      .single()
  );
  const novemberImport = must(
    'import noviembre',
    await sb
      .from('attendance_report_imports')
      .insert({
        unit_id: unit.id,
        report_date: '2026-11-30',
        source_filename: 'DEMO Asistencia Torre Pacifico Noviembre 2026.xlsx',
        sheet_used: 'Noviembre',
        uploaded_by: null,
        column_mapping: {},
      })
      .select('id')
      .single()
  );

  const rowPayloads = markDrafts.map((m, index) => ({
    import_id: m.day.startsWith('2026-10') ? octoberImport.id : novemberImport.id,
    row_index: index + 1,
    worker_name: m.name,
    dni: m.worker.dni,
    normalized_dni: m.worker.dni,
    attendance_status: m.attendance_status,
    minutes_late: m.minutes_late,
    notes: m.notes,
    user_comment: m.user_comment,
    matched_resource_id: ids[m.worker.key],
    raw: { origen: 'demo' },
    mark_date: m.day,
    punch_arrival: m.punch_arrival,
    punch_lunch_out: m.punch_lunch_out,
    punch_lunch_in: m.punch_lunch_in,
    punch_departure: m.punch_departure,
  }));
  const insertedRows = await chunkedInsert('attendance_report_rows', rowPayloads, 'id, row_index');
  const rowIdByIndex = new Map(insertedRows.map((r) => [r.row_index, r.id]));
  const marks = markDrafts.map((m, index) => ({
    unit_id: unit.id,
    resource_id: ids[m.worker.key],
    mark_date: m.day,
    attendance_status: m.attendance_status,
    minutes_late: m.minutes_late,
    notes: m.notes,
    user_comment: m.user_comment,
    punch_arrival: m.punch_arrival,
    punch_lunch_out: m.punch_lunch_out,
    punch_lunch_in: m.punch_lunch_in,
    punch_departure: m.punch_departure,
    dni: m.worker.dni,
    normalized_dni: m.worker.dni,
    worker_name: m.name,
    source_import_id: m.day.startsWith('2026-10') ? octoberImport.id : novemberImport.id,
    source_row_id: rowIdByIndex.get(index + 1) || null,
    source_filename: m.day.startsWith('2026-10')
      ? 'DEMO Asistencia Torre Pacifico Octubre 2026.xlsx'
      : 'DEMO Asistencia Torre Pacifico Noviembre 2026.xlsx',
  }));
  await chunkedInsert('attendance_worker_marks', marks);

  console.log('Bitácora, requerimientos, libro y vacaciones…');
  const logs = [
    {
      date: '2026-11-20',
      type: 'Supervision',
      description: 'Recorrido de pisos 7 al 14 y hall de ascensores. El brillo del piso quedó dentro del estándar. Se pidió reponer jabón del baño de damas del piso 11.',
      author: 'Ricardo Omar Flores Peña',
      image: photos.pasillo,
      who: ids.rosa,
    },
    {
      date: '2026-11-06',
      type: 'Capacitacion',
      description: 'Repaso de dilución de químicos con el turno mañana. Participaron Rosa, Luis y María. No hubo observaciones de EPP.',
      author: 'Patricia Elena Vargas Soto',
      who: ids.luis,
    },
    {
      date: '2026-11-12',
      type: 'Incidencia',
      description: 'José Paredes presentó descanso médico. Carmen cubrió el cierre del lobby y Luis dejó adelantada la zona de pisos bajos.',
      author: 'Rosa Elena Quispe Huamán',
      who: ids.jose,
    },
    {
      date: '2026-11-18',
      type: 'Visita Cliente',
      description: 'Lucía Herrera recorrió lobby y piso 8 con la supervisión. Quedó conforme con la presentación del ingreso. Se conversó la falta de Luis de ese día.',
      author: 'Patricia Elena Vargas Soto',
      image: photos.lobby,
      who: ids.rosa,
    },
    {
      date: '2026-10-28',
      type: 'Coordinacion',
      description: 'Se confirmó el ingreso de Carmen Torres para el 2 de noviembre, en reemplazo progresivo del turno tarde.',
      author: 'Patricia Elena Vargas Soto',
      who: patricia.id,
    },
    {
      date: '2026-10-15',
      type: 'Mantenimiento',
      description: 'Mantenimiento preventivo de la fregadora compacta. Quedó operativa para los sábados de María Castillo.',
      author: 'Ricardo Omar Flores Peña',
      who: machine.id,
    },
  ];
  for (const log of logs) {
    const created = must(
      `log ${log.date}`,
      await sb
        .from('operational_logs')
        .insert({
          unit_id: unit.id,
          date: log.date,
          type: log.type,
          description: log.description,
          author: log.author,
        })
        .select('id')
        .single()
    );
    if (log.image) {
      must('foto de log', await sb.from('log_images').insert({ operational_log_id: created.id, image_url: log.image }));
    }
    const isStaff = log.who === patricia.id;
    must(
      'responsable de log',
      await sb.from('log_responsible').insert({
        operational_log_id: created.id,
        resource_id: isStaff ? null : log.who,
        management_staff_id: isStaff ? patricia.id : null,
      })
    );
  }

  const requestA = must(
    'requerimiento cobertura',
    await sb
      .from('client_requests')
      .insert({
        unit_id: unit.id,
        date: '2026-11-12T14:10:00.000Z',
        title: 'Cobertura por descanso médico en turno tarde',
        category: 'PERSONNEL',
        priority: 'HIGH',
        status: 'RESOLVED',
        description: 'José no podrá cerrar el turno de hoy. Necesitamos que el lobby y los baños de pisos 1 al 4 queden atendidos antes de las 21:00.',
        author: 'Lucía Herrera Vidal',
        response: 'Carmen adelantó su ingreso y Rosa dejó el checklist del cierre. El lobby quedó conforme a las 20:40.',
        resolved_date: '2026-11-12T21:05:00.000Z',
        related_resource_id: ids.jose,
      })
      .select('id')
      .single()
  );
  must(
    'comentarios cobertura',
    await sb.from('request_comments').insert([
      {
        client_request_id: requestA.id,
        author: 'Lucía Herrera Vidal',
        role: 'CLIENT',
        date: '2026-11-12T14:20:00.000Z',
        text: 'El directorio tiene una reunión a las 19:30 en el piso 3. El hall no puede quedar a medias.',
      },
      {
        client_request_id: requestA.id,
        author: 'Patricia Elena Vargas Soto',
        role: 'OPERATIONS',
        date: '2026-11-12T14:35:00.000Z',
        text: 'Carmen ya está en camino. Rosa se queda hasta pasar la posta del lobby.',
      },
    ])
  );

  must(
    'requerimiento insumos',
    await sb.from('client_requests').insert({
      unit_id: unit.id,
      date: '2026-11-21T11:00:00.000Z',
      title: 'Reposición de papel y jabón en pisos 8 al 12',
      category: 'LOGISTICS',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      description: 'En el piso 10 el dispensador de jabón amaneció vacío dos días esta semana. Pedimos confirmar el stock y la frecuencia de reposición.',
      author: 'Lucía Herrera Vidal',
      response: 'Se repuso el piso 10 el 21 de noviembre. Almacén envía un paquete adicional el lunes 24.',
      related_resource_id: ids.maria,
    })
  );
  must(
    'requerimiento lobby',
    await sb.from('client_requests').insert({
      unit_id: unit.id,
      date: '2026-11-24T09:40:00.000Z',
      title: 'Planta adicional en el lobby los viernes',
      category: 'GENERAL',
      priority: 'LOW',
      status: 'PENDING',
      description: 'Los viernes hay más visitas. ¿Pueden sumar una hora de presencia en el lobby entre las 8 y las 9?',
      author: 'Lucía Herrera Vidal',
    })
  );

  must(
    'incidencias',
    await sb.from('payroll_attendance_incidents').insert([
      {
        unit_id: unit.id,
        employee_id: ids.jose,
        incident_type: 'DESCANSO_MEDICO_INICIAL',
        incident_reason: 'SALUD_EMERGENCIA',
        has_coverage: 'CON_COBERTURA',
        status: 'MEDICAL_REST',
        incident_date: '2026-11-12',
        observations: 'CITT de un día. Carmen cubrió el cierre del lobby.',
        reported_by: 'Rosa Elena Quispe Huamán',
      },
      {
        unit_id: unit.id,
        employee_id: ids.luis,
        incident_type: 'INASISTENCIA',
        incident_reason: 'PROBLEMA_PERSONAL',
        has_coverage: 'SIN_COBERTURA',
        status: 'UNJUSTIFIED_ABSENCE',
        incident_date: '2026-11-18',
        observations: 'No marcó y no avisó. Se conversó con el cliente en la visita del mismo día.',
        reported_by: 'Rosa Elena Quispe Huamán',
      },
    ])
  );

  must(
    'libro de sede',
    await sb.from('unit_books').insert({
      unit_id: unit.id,
      service_objective:
        'Mantener la torre lista para la operación de oficinas: ingreso presentación, pisos limpios antes de las 9:00 y control de acceso durante la noche.',
      floor_count: 14,
      welcome_message:
        'Bienvenida a Torre Pacífico. Este es el equipo que va a encontrar en la sede y la forma en que trabajamos cada turno.',
      work_schedule:
        'Mañana 07:00–15:00, tarde 15:00–23:00 y noche 23:00–07:00. El descanso semanal es el domingo. El 8 de octubre fue feriado.',
      dress_code: 'Polo azul marino, pantalón oscuro y fotocheck visible. Seguridad usa camisa charcoal.',
      access_instructions:
        'El personal ingresa por el sótano 1, marca en el reloj del estacionamiento y sube por el ascensor de servicio. Las visitas usan el lobby de Basadre.',
      important_notes:
        'Los viernes hay más tráfico entre 8:00 y 9:00. El jabón de los pisos 8 al 12 se revisa al inicio de cada turno.',
      custom_sections: [
        {
          id: 'contacto-cliente',
          title: 'Contacto del cliente',
          body: 'Lucía Herrera Vidal, administración del edificio. Celular 987 654 010. Los requerimientos se atienden el mismo día si llegan antes de las 15:00.',
        },
      ],
    })
  );
  must(
    'fotos del libro',
    await sb.from('unit_book_photos').insert([
      { unit_id: unit.id, image_url: photos.exterior, caption: 'Ingreso por Av. Jorge Basadre', display_order: 0 },
      { unit_id: unit.id, image_url: photos.lobby, caption: 'Lobby principal', display_order: 1 },
      { unit_id: unit.id, image_url: photos.pasillo, caption: 'Hall de ascensores después del turno de la mañana', display_order: 2 },
    ])
  );
  const members = WORKERS.filter((w) => !w.archived).map((w, index) => ({
    unit_id: unit.id,
    resource_id: ids[w.key],
    functions: w.functions,
    experience: w.experienceText,
    work_zone: w.zone,
    colleague_message: w.message,
    include_in_book: true,
    display_order: index,
  }));
  must('equipo del libro', await sb.from('unit_book_members').insert(members));

  const people = (keys) => keys.map((key) => ({ id: key, resourceId: ids[key], name: WORKERS.find((w) => w.key === key).nombres.split(' ')[0], role: WORKERS.find((w) => w.key === key).puesto }));
  must(
    'plan de trabajo',
    await sb.from('unit_work_plans').insert({
      unit_id: unit.id,
      title: 'Plan de trabajo Torre Pacífico',
      valid_from: '2026-11-01',
      valid_until: '2026-12-31',
      notes: 'Plan vigente de la sede demo. El domingo no hay servicio.',
      status: 'active',
      created_by_name: 'Patricia Elena Vargas Soto',
      updated_by_name: 'Patricia Elena Vargas Soto',
      shifts: [
        {
          id: 'manana',
          name: 'Mañana',
          people: people(['rosa', 'luis', 'maria']),
          slots: [
            {
              id: 'm1',
              startTime: '07:00',
              endTime: '09:00',
              activities: [
                { id: 'a1', text: 'Apertura, marcado y revisión de dispensadores', frequency: 'diaria', weekdays: [], personIds: ['rosa'], zones: ['Lobby'] },
                { id: 'a2', text: 'Limpieza de oficinas y baños de pisos 1 al 6', frequency: 'diaria', weekdays: [], personIds: ['luis'], zones: ['Pisos 1 al 6'] },
                { id: 'a3', text: 'Limpieza de oficinas de pisos 7 al 14', frequency: 'diaria', weekdays: [], personIds: ['maria'], zones: ['Pisos 7 al 14'] },
              ],
            },
            {
              id: 'm2',
              startTime: '09:00',
              endTime: '15:00',
              activities: [
                { id: 'a4', text: 'Presencia en lobby y recorrido de supervisión', frequency: 'diaria', weekdays: [], personIds: ['rosa'], zones: ['Lobby'] },
                { id: 'a5', text: 'Pasada con fregadora en halls', frequency: 'semanal', weekdays: [6], personIds: ['maria'], zones: ['Pisos 7 al 14'] },
              ],
            },
          ],
        },
        {
          id: 'tarde',
          name: 'Tarde',
          people: people(['jose', 'carmen']),
          slots: [
            {
              id: 't1',
              startTime: '15:00',
              endTime: '23:00',
              activities: [
                { id: 'a6', text: 'Cierre de limpieza de pisos bajos y baños', frequency: 'diaria', weekdays: [], personIds: ['jose'], zones: ['Pisos 1 al 6', 'Servicios higiénicos'] },
                { id: 'a7', text: 'Mantenimiento menor y reporte de luminarias', frequency: 'diaria', weekdays: [], personIds: ['carmen'], zones: ['Servicios higiénicos'] },
              ],
            },
          ],
        },
        {
          id: 'noche',
          name: 'Noche',
          people: people(['diego']),
          slots: [
            {
              id: 'n1',
              startTime: '23:00',
              endTime: '07:00',
              activities: [
                { id: 'a8', text: 'Control de acceso y ronda de estacionamiento', frequency: 'diaria', weekdays: [], personIds: ['diego'], zones: ['Ingreso y estacionamiento'] },
              ],
            },
          ],
        },
      ],
    })
  );

  const papeleta = must(
    'papeleta',
    await sb
      .from('vacation_papeletas')
      .insert({
        resource_id: ids.rosa,
        unit_id: unit.id,
        code: 'VAC-DEMO-TP-2026-001',
        worker_name: 'Rosa Elena Quispe Huamán',
        worker_dni: '45821367',
        unit_name: UNIT_NAME,
        start_date: '2026-10-19',
        end_date: '2026-10-23',
        return_date: '2026-10-24',
        calendar_days: 5,
        source_type: 'direct',
        status: 'issued',
        notes: 'Vacaciones de octubre, de lunes a viernes.',
      })
      .select('id')
      .single()
  );
  const vacationRows = [];
  const balances = [];
  for (const worker of WORKERS) {
    balances.push({
      resource_id: ids[worker.key],
      historical_taken_days: worker.historicalVacation,
      annual_entitlement: 30,
      notes: 'Saldo de demostración',
    });
    for (const day of worker.vacation) {
      vacationRows.push({
        resource_id: ids[worker.key],
        unit_id: unit.id,
        vacation_date: day,
        days_count: 1,
        status: 'batched',
        papeleta_id: worker.key === 'rosa' ? papeleta.id : null,
        notes: 'Vacaciones de octubre',
      });
    }
  }
  await chunkedInsert('vacation_balances', balances);
  if (vacationRows.length) await chunkedInsert('vacation_day_entries', vacationRows);

  console.log(
    JSON.stringify(
      {
        unitId: unit.id,
        unit: UNIT_NAME,
        client: CLIENT_NAME,
        ruc: CLIENT_RUC,
        workers: Object.fromEntries(WORKERS.map((w) => [w.key, ids[w.key]])),
        shifts: shifts.length,
        novedades: novedades.length,
        marks: marks.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
