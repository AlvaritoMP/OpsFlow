export type AppHelpView =
  | 'dashboard'
  | 'units'
  | 'unit-detail'
  | 'settings'
  | 'control-center'
  | 'client-control-center'
  | 'reports'
  | 'audit-logs'
  | 'operations-dashboard'
  | 'assets-catalog'
  | 'retenes'
  | 'night-supervision'
  | 'headcount'
  | 'vacations'
  | 'archive'
  | 'workers-management'
  | 'ats-reception'
  | 'ats-presentations'
  | 'hr-opalosis';

export interface HelpSection {
  heading: string;
  body: string;
  steps?: string[];
  tips?: string[];
}

export interface HelpTopic {
  id: AppHelpView | 'overview';
  title: string;
  navLabel: string;
  summary: string;
  sections: HelpSection[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'overview',
    title: 'Cómo funciona OpsFlow',
    navLabel: 'Inicio / General',
    summary:
      'OpsFlow es el sistema operativo para gestionar unidades de servicio, personal, asistencia, vacaciones, retenes y flujos ATS/RRHH desde un solo lugar.',
    sections: [
      {
        heading: 'Navegación',
        body: 'Use el menú lateral izquierdo para cambiar de módulo. En móvil, abra el menú con el ícono de tres líneas. La opción Ayuda (ícono ?) está siempre disponible y se adapta a la pantalla en la que se encuentre.',
        tips: [
          'Los módulos visibles dependen de su rol y permisos.',
          'Puede cerrar sesión desde el menú del usuario al pie de la barra lateral.',
        ],
      },
      {
        heading: 'Roles principales',
        body: 'Cada usuario tiene un rol que define qué puede ver y editar.',
        steps: [
          'SUPER_ADMIN / ADMIN: acceso completo, configuración y auditoría.',
          'OPERATIONS / OPERATIONS_SUPERVISOR: operación diaria de unidades, retenes, ATS y vacaciones.',
          'CLIENT: vista limitada a dashboard, unidades asignadas, centro de control y headcount (según permisos).',
        ],
      },
      {
        heading: 'Flujo típico de trabajo',
        body: 'La operación diaria suele seguir este orden:',
        steps: [
          'Revisar el Dashboard o el Centro de Control para el estado general.',
          'Entrar a una Unidad para personal, asistencia, bitácora o requerimientos.',
          'Gestionar Retenes, Vacaciones o Supervisión Nocturna según la necesidad del día.',
          'En Presentaciones ATS: revisar ficha, aprobar o rechazar candidatos a entrevista.',
          'Solo si el aprobado iniciará labores: registrar en unidad (fecha de ingreso) y luego Envío Opalosis.',
        ],
        tips: [
          'Recepción ATS es un proceso antiguo (solo consulta). El flujo activo de candidatos es Presentaciones ATS.',
          'Aprobar en Presentaciones no crea al trabajador ni dispara Opalosis; eso ocurre al registrar en una unidad.',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    navLabel: 'Dashboard',
    summary:
      'Vista resumen del estado operativo: unidades activas, personal, alertas e indicadores clave.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'El Dashboard concentra métricas de unidades, trabajadores por turno, rotación, retenes y actividad reciente para tener una lectura rápida del día.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Revise las tarjetas superiores (unidades, personal, incidencias).',
          'Use el mapa o listados para ir directo a una unidad (clic en la unidad).',
          'Pase el cursor sobre indicadores para ver el detalle del cálculo cuando esté disponible.',
        ],
        tips: [
          'Los usuarios CLIENT ven una versión filtrada según sus unidades visibles.',
        ],
      },
    ],
  },
  {
    id: 'control-center',
    title: 'Centro de Control',
    navLabel: 'Centro de Control',
    summary:
      'Tablero operativo de unidades y personal de gestión para seguimiento en tiempo casi real.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Permite ver y actualizar el estado de las unidades, cobertura y personal de gestión asignado sin entrar unidad por unidad.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Busque o filtre la unidad que necesita.',
          'Revise estado, contacto y personal de gestión asociado.',
          'Actualice información según su permiso de edición.',
        ],
        tips: [
          'En pantallas pequeñas el panel ocupa todo el alto disponible; use el menú para salir a otros módulos.',
        ],
      },
    ],
  },
  {
    id: 'units',
    title: 'Unidades',
    navLabel: 'Unidades',
    summary:
      'Listado de sedes/servicios. Desde aquí se abre el detalle completo de cada unidad.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Las unidades son el núcleo de OpsFlow. Cada una agrupa personal, asistencia, logística, documentos, planos y requerimientos del cliente.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Use el buscador para filtrar por nombre o cliente.',
          'Haga clic en una unidad para abrir su ficha detalle.',
          'Si tiene permisos, cree unidades nuevas desde el botón correspondiente.',
        ],
        tips: [
          'Hay dos clases: Operaciones (campo) y BPO (servicios administrativos). Las pestañas del detalle cambian según la clase.',
          'Las unidades desactivadas no aparecen en la operación diaria.',
        ],
      },
    ],
  },
  {
    id: 'unit-detail',
    title: 'Detalle de Unidad',
    navLabel: 'Detalle de Unidad',
    summary:
      'Ficha completa de una unidad con pestañas para personal, asistencia, vacaciones, logística, bitácora y más.',
    sections: [
      {
        heading: 'Pestañas principales',
        body: 'Según el tipo de unidad (Operaciones o BPO) verá un conjunto distinto de pestañas.',
        steps: [
          'General: datos base, estado y responsables.',
          'Personal: trabajadores asignados, altas, ceses y perfiles.',
          'Asistencia: tareo / marcas del personal.',
          'Vacaciones: control de goce por persona en la unidad.',
          'Variables: conceptos variables de compensación (si aplica).',
          'Logística: equipos y materiales (unidades de Operaciones).',
          'Supervisión / Actividades: bitácora de eventos e incidencias.',
          'Plano: planos y ubicación.',
          'Requerimientos: solicitudes del cliente.',
          'Documentos: archivos de la unidad.',
          'Contactos / Bancos: solo en unidades BPO.',
        ],
      },
      {
        heading: 'Turnos / Rostering',
        body: 'En Personal, el modo Turnos / Rostering muestra la programación semanal de cada colaborador. Puede ampliar el rango a 2 o 4 semanas, ver cuántos trabajadores están programados cada día y descargar la vista en PNG o PDF.',
        steps: [
          'Abra la unidad → Personal → Turnos / Rostering.',
          'Elija 1, 2 o 4 semanas. Las flechas mueven el periodo completo.',
          'Al pie de cada día aparece el total de programados (con desglose Día / Tarde / Noche). Al final de cada semana, el total de trabajadores con al menos un turno y la suma de turnos.',
          'Use PNG o PDF para descargar la programación visible (recomendado: 1 semana para compartir o imprimir).',
          'Si tiene permiso de edición, haga clic en un turno para ciclarlo (Día → Tarde → Noche → OFF) y pulse Guardar planificación.',
        ],
        tips: [
          'Los nombres largos se muestran completos en varias líneas dentro de la columna Colaborador, también al descargar PNG o PDF.',
          'Copiar a sem. siguiente replica solo la primera semana visible hacia la semana siguiente. Confirme con Guardar planificación.',
        ],
      },
      {
        heading: 'Ficha complementaria del trabajador',
        body: 'Al expandir un colaborador en la pestaña Personal verá el panel Ficha complementaria. Ahí están los datos que vinieron del ATS (o que OpsFlow completó) y puede consultarlos o editarlos con autonomía.',
        steps: [
          'Abra Personal y expanda la fila del trabajador.',
          'Despliegue Ficha complementaria.',
          'Revise o edite datos personales, contacto, tallas, bancos, etc.',
          'Pulse Guardar ficha. Los cambios quedan en OpsFlow; no modifican etapas del ATS.',
        ],
        tips: [
          'La fecha de ingreso del trabajador es la del registro en la unidad, no la de la aprobación en Presentaciones ATS.',
          'Si llegó desde Presentaciones, salario, bono de movilidad, asignación familiar, jornada, régimen, turno, días y horario se precargan desde las condiciones OpsFlow; el resto (localidad, etc.) puede quedar en blanco hasta completarlos aquí.',
          'En unidades BPO también puede existir un perfil BPO adicional; la ficha complementaria es independiente.',
        ],
      },
      {
        heading: 'Información Salarial',
        body: 'Al expandir un colaborador en Personal verá el bloque Información Salarial: salario bruto mensual, condición de trabajo (movilidad), bono, asignación familiar (sí/no) y régimen laboral (General, Pyme o Mype). Son conceptos distintos: la movilidad va solo en condición de trabajo; el bono no es de movilidad. Los conceptos variables del mes se gestionan en la pestaña Variables.',
        steps: [
          'Abra la unidad → Personal y expanda la fila del trabajador.',
          'Revise salario bruto, condición de trabajo (movilidad), bono, asignación familiar y régimen laboral.',
          'Si tiene permiso, use Editar para cambiar esos datos, o Registrar Incremento para dejar historial de aumentos.',
          'Los conceptos variables (comisiones, bonos del mes) se cargan en la pestaña Variables.',
        ],
        tips: [
          'Condición de trabajo = movilidad. El bono es un monto adicional aparte; no lo registre como movilidad.',
          'El bono puede ser 0 si no aplica.',
        ],
      },
      {
        heading: 'Datos del colaborador',
        body: 'En Personal, la jornada (4, 8 o 12 horas) se ve en la fila de cada colaborador, junto al turno. Se registra al crear o editar si aún está vacía; una vez ingresada no se puede cambiar.',
        steps: [
          'Alta o Editar: si la jornada está vacía, elija 4, 8 o 12 horas y guarde.',
          'Después de guardarla aparece en la fila y queda bloqueada, igual que el teléfono.',
        ],
      },
      {
        heading: 'Alta directa de colaborador',
        body: 'Los referidos se activan en la unidad sin pasar por ATS, por eso no traen ficha complementaria. Al crearlos (Nuevo colaborador o carga masiva) OpsFlow los encola en Envío Opalosis y usted les envía el landing /ficha para que completen sus datos.',
        tips: [
          'Use DNI al dar de alta: el landing abre la ficha con ese documento.',
          'Mientras el ítem siga pendiente, lo que el trabajador guarde en /ficha (o usted en Ficha complementaria) actualiza la cola. Si ya se envió a Opalosis, no se pisa.',
          'El alta queda en la unidad aunque falle el encolado; use «Sincronizar cola» en Envío Opalosis.',
        ],
      },
      {
        heading: 'Consejos',
        body: 'Use el botón de volver para regresar al listado de unidades sin perder el contexto del menú.',
        tips: [
          'Los permisos por pestaña (ver/editar) se configuran en Configuración → Permisos.',
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Informes',
    navLabel: 'Informes',
    summary: 'Reportes y analítica agregada a partir de las unidades y su operación.',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Seleccione el tipo de informe o periodo que necesita.',
          'Filtre por unidad o cliente si la vista lo permite.',
          'Exporte o revise los gráficos según la opción disponible.',
        ],
      },
    ],
  },
  {
    id: 'operations-dashboard',
    title: 'Dashboard Operaciones',
    navLabel: 'Dashboard Operaciones',
    summary: 'Indicadores orientados al equipo de operaciones y supervisión.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Complementa el Dashboard principal con métricas y seguimiento específicos del área de operaciones.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Revise los indicadores del periodo mostrado.',
          'Use los filtros o selectores de usuario/contexto si aparecen en pantalla.',
        ],
      },
    ],
  },
  {
    id: 'retenes',
    title: 'Retenes',
    navLabel: 'Retenes',
    summary:
      'Gestión del personal de retén: disponibilidad, asignación semanal a unidades y reportes.',
    sections: [
      {
        heading: 'Vistas',
        steps: [
          'Semanal: calendario de asignaciones de la semana (navegue con las flechas).',
          'Retenes: alta/edición del personal de retén (datos, foto, estado).',
          'Reportes: consolidado mensual y exportación.',
        ],
      },
      {
        heading: 'Cómo asignar un retén',
        steps: [
          'Abra la vista Semanal o cree una asignación nueva.',
          'Elija retén, unidad, fecha, horario y tipo (planificada o inmediata).',
          'Indique el motivo y guarde.',
          'Genere constancias o exportes cuando lo necesite desde las acciones disponibles.',
        ],
        tips: [
          'Mantenga actualizado el estado del retén (disponible / no disponible) para evitar asignaciones incorrectas.',
        ],
      },
    ],
  },
  {
    id: 'headcount',
    title: 'Headcount',
    navLabel: 'Headcount',
    summary: 'Control de puestos y cobertura de personal por unidad.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Compara lo requerido versus lo cubierto en cada unidad para detectar faltantes o sobrecupaciones.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Revise la matriz o listado de puestos por unidad.',
          'Actualice asignaciones si tiene permiso de edición.',
          'Use esta vista junto con Unidades → Personal para completar altas.',
        ],
      },
    ],
  },
  {
    id: 'vacations',
    title: 'Vacaciones',
    navLabel: 'Vacaciones',
    summary:
      'Control de vacaciones, calendario y autorizaciones pendientes.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Centraliza el goce vacacional y el flujo de autorización. Si usted es autorizador, verá un aviso en la app cuando haya solicitudes pendientes.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Revise el calendario o listados de vacaciones.',
          'Si tiene el badge de pendientes, entre a la pestaña de Autorizaciones.',
          'Apruebe o gestione cada solicitud según corresponda.',
        ],
        tips: [
          'También puede gestionar vacaciones desde el detalle de cada unidad (pestaña Vacaciones).',
        ],
      },
    ],
  },
  {
    id: 'workers-management',
    title: 'Trabajadores',
    navLabel: 'Trabajadores',
    summary: 'Gestión transversal del personal operativo más allá de una sola unidad.',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Busque trabajadores por nombre o documento.',
          'Revise su estado y unidades asociadas.',
          'Use las acciones de edición según su permiso.',
        ],
      },
      {
        heading: 'Ficha complementaria',
        body: 'Los datos de ficha (personales, contacto, familiares, educación, bancos, etc.) se consultan y editan principalmente desde el detalle de la Unidad → Personal → expandir trabajador → Ficha complementaria.',
        tips: [
          'Si el trabajador llegó desde Presentaciones ATS, la ficha viene precargada del handoff; OpsFlow puede completar o corregir datos después.',
        ],
      },
    ],
  },
  {
    id: 'ats-reception',
    title: 'Recepción ATS (archivo)',
    navLabel: 'Recepción ATS',
    summary:
      'Proceso antiguo de handoff ATS. Hoy es solo consulta histórica; el flujo activo es Presentaciones ATS.',
    sections: [
      {
        heading: 'Estado actual',
        body: 'Recepción ATS quedó deshabilitada como proceso operativo. Se mantiene para consultar paquetes antiguos ya procesados. Los nuevos envíos de candidatos a entrevista llegan a Presentaciones ATS.',
      },
      {
        heading: 'Qué hacer en su lugar',
        steps: [
          'Use Presentaciones ATS para pendientes, aprobación, rechazo y edición de ficha.',
          'Si el candidato aprobado inicia labores, regístrelo en una unidad (fecha de ingreso).',
          'Luego gestione el alta RRHH en Envío Opalosis.',
        ],
        tips: [
          'El contador del menú de Recepción ATS, si aparece, corresponde a pendientes legacy; no es el flujo de entrevista actual.',
        ],
      },
    ],
  },
  {
    id: 'ats-presentations',
    title: 'Presentaciones ATS',
    navLabel: 'Presentaciones ATS',
    summary:
      'Bandeja activa de candidatos enviados a entrevista desde el ATS: revisar ficha, aprobar, rechazar o archivar sin ingreso.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'El área usuaria trabaja solo en OpsFlow. Al presentar a entrevista, el ATS envía el candidato con su ficha complementaria. Aquí se decide el resultado de la presentación sin modificar etapas del proceso de selección en el ATS.',
      },
      {
        heading: 'Filtros de la bandeja',
        steps: [
          'Pendientes: por revisar o en revisión.',
          'Aprobados: aprobados (aún sin unidad) y ya registrados en unidad.',
          'Rechazados: rechazados en entrevista (con motivo).',
          'Archivados: aprobados que nunca iniciaron labores (sin contrato / sin ingreso).',
          'Todos: vista completa.',
        ],
      },
      {
        heading: 'Cómo revisar y editar la ficha',
        steps: [
          'Abra el candidato desde la lista (la vista está pensada también para móvil).',
          'Revise Identidad ATS y Datos del proceso (secciones colapsables).',
          'En Ficha complementaria edite lo que falte o corrija datos.',
          'Pulse Guardar avances. Puede guardar varias veces antes de decidir.',
        ],
        tips: [
          'Si el ATS envió poca ficha, OpsFlow completa lo posible desde identidad y campos del proceso; el resto se edita aquí.',
          'También puede enviar al trabajador el link público /ficha para que complete la ficha con su DNI (hasta 3 aperturas, sin login).',
        ],
      },
      {
        heading: 'Landing público de ficha (sin login)',
        body: 'Cualquier persona puede abrir https://<tu-dominio>/ficha, ingresar su DNI y completar la ficha complementaria. No requiere cuenta en OpsFlow.',
        steps: [
          'Copie el link con el botón “Link ficha pública” en esta bandeja y envíelo al trabajador.',
          'El trabajador ingresa su DNI de 8 dígitos y completa el formulario.',
          'Cada DNI puede abrir la ficha hasta 3 veces. Al agotar las aperturas, la ficha queda bloqueada (solo lectura).',
          'Lo guardado se replica en la presentación ATS y, si ya es colaborador, en su ficha de personal.',
        ],
        tips: [
          'Una recarga o un nuevo ingreso de DNI cuenta como otra apertura. La sesión actual (unas 12 horas) no consume un cupo extra al guardar.',
        ],
      },
      {
        heading: 'Condiciones OpsFlow (salario y horario)',
        body: 'Antes de registrar en unidad, el equipo interno define salario mensual, bono de movilidad, asignación familiar (sí/no), jornada (4, 8 o 12 horas), régimen (General, Pyme, Mype), días de trabajo, hora de entrada/salida y turno (Diurno, Tarde o Nocturno).',
        steps: [
          'Complete la sección Condiciones OpsFlow en la ficha del candidato (puede hacerlo antes o después de aprobar).',
          'Pulse Guardar condiciones.',
          'Al Registrar en unidad, esos datos precargan Personal. Lo que no venga en el paquete queda en blanco para completar después en la unidad.',
        ],
        tips: [
          'No se puede registrar en unidad si faltan salario, bono de movilidad, asignación familiar, jornada (4, 8 o 12 horas), régimen, días, horario o turno. El bono puede ser 0 si no aplica.',
        ],
      },
      {
        heading: 'Aprobar o rechazar',
        steps: [
          'Aprobar: deja al candidato listo para un posible ingreso; aún no es trabajador de OpsFlow.',
          'Rechazar: exige motivo. Cierra la presentación.',
          'Al aprobar/rechazar se registra un evento interno hacia el ATS (callback/outbox); no cambia etapas del proceso ATS.',
        ],
        tips: [
          'Aprobar no encola Opalosis ni crea colaborador. Eso solo ocurre al Registrar en unidad.',
        ],
      },
      {
        heading: 'Registrar en unidad vs archivar sin ingreso',
        body: 'La aprobación no significa que el candidato inicie labores. La fecha de ingreso es cuando se registra en una unidad.',
        steps: [
          'Registrar en unidad: crea el colaborador con datos del paquete + condiciones OpsFlow, fija el ingreso operativo y encola el envío a Opalosis.',
          'Archivar sin ingreso: use cuando el aprobado no iniciará labores (no se presentó, no aceptó condiciones, cliente canceló, etc.). Requiere motivo.',
          'Archivado sin ingreso es distinto de un cese: nunca trabajó ni tuvo contrato en OpsFlow.',
        ],
      },
    ],
  },
  {
    id: 'hr-opalosis',
    title: 'Envío Opalosis (RRHH)',
    navLabel: 'Envío Opalosis',
    summary:
      'Cola de envío de ingresos a Opalosis. Se llena al registrar un candidato de Presentaciones en una unidad o al crear un colaborador directo en OpsFlow.',
    sections: [
      {
        heading: 'Para qué sirve',
        body: 'Opalosis gestiona el ingreso/contratación en RRHH. La cola se llena al registrar un candidato de Presentaciones en una unidad, o al crear un referido/alta directa en Personal. Esos últimos no traen ficha ATS: completan datos en /ficha y, si el ítem sigue pendiente, la cola se actualiza sola.',
      },
      {
        heading: 'Cómo usarlo',
        steps: [
          'Confirme que el trabajador ya está en una unidad (Presentaciones ATS o alta directa en Personal).',
          'Revise la cola de ítems pendientes o con error.',
          'Edite datos si el ítem lo permite antes de enviar o reenviar.',
          'Confirme el envío y verifique el estado resultante.',
        ],
        tips: [
          'Si un envío falla, corrija el dato indicado y reintente; no duplique el ingreso manualmente sin revisar el estado.',
          'Candidatos solo aprobados (sin unidad) o archivados sin ingreso no deben aparecer aquí.',
          '«Sincronizar cola» recupera presentaciones y altas directas de los últimos 7 días que no hayan quedado encoladas.',
          'Antes de enviar, OpsFlow refresca la ficha viva (landing o edición en unidad). Un paquete ya enviado no se modifica.',
        ],
      },
    ],
  },
  {
    id: 'archive',
    title: 'Archivo',
    navLabel: 'Archivo',
    summary: 'Histórico de personal cesado o archivado que sí llegó a ser colaborador de una unidad.',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Busque por nombre o documento.',
          'Abra el registro para ver el historial asociado.',
          'Use esta vista para consultas; las altas nuevas se hacen desde Unidades, Presentaciones ATS o Trabajadores.',
        ],
        tips: [
          'Candidatos de Presentaciones ATS “Archivados (sin ingreso)” no son lo mismo: nunca fueron trabajadores. Consúltelos en Presentaciones ATS → Archivados.',
        ],
      },
    ],
  },
  {
    id: 'night-supervision',
    title: 'Supervisión Nocturna',
    navLabel: 'Supervisión Nocturna',
    summary: 'Registro y seguimiento de supervisiones en turno noche.',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Seleccione la unidad y el turno/fecha.',
          'Registre hallazgos, visitas o incidencias.',
          'Guarde y revise el historial de supervisiones previas.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Configuración',
    navLabel: 'Configuración',
    summary:
      'Administración del sistema: permisos, usuarios, clientes, branding, integraciones y puestos.',
    sections: [
      {
        heading: 'Secciones',
        steps: [
          'Permisos: qué puede ver/editar cada rol por módulo.',
          'Branding: logo y apariencia (Powered By).',
          'Usuarios: altas, roles y unidades visibles para CLIENT.',
          'Personal de gestión: staff de supervisión/gestión.',
          'Clientes: razón social, RUC y representantes.',
          'Integraciones: APIs (inventario, Gemini, etc.).',
          'Puestos: catálogo de posiciones para headcount.',
        ],
        tips: [
          'Solo roles con permiso SETTINGS acceden a este módulo.',
          'Cambios de permisos afectan de inmediato la navegación del menú.',
        ],
      },
    ],
  },
  {
    id: 'assets-catalog',
    title: 'Catálogo de Activos',
    navLabel: 'Catálogo',
    summary: 'Catálogo estándar de activos/equipos usados en logística de unidades.',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Consulte o edite ítems del catálogo según su permiso.',
          'Los activos del catálogo alimentan la pestaña Logística de las unidades de Operaciones.',
        ],
      },
    ],
  },
  {
    id: 'audit-logs',
    title: 'Auditoría',
    navLabel: 'Auditoría',
    summary: 'Registro de acciones relevantes del sistema (solo administradores).',
    sections: [
      {
        heading: 'Cómo usarlo',
        steps: [
          'Filtre por fecha, usuario o tipo de evento si la vista lo permite.',
          'Use esta bitácora para investigar cambios o accesos.',
        ],
      },
    ],
  },
  {
    id: 'client-control-center',
    title: 'Centro de Control (Cliente)',
    navLabel: 'Centro de Control Cliente',
    summary: 'Vista de centro de control orientada a usuarios cliente.',
    sections: [
      {
        heading: 'Cómo usarlo',
        body: 'Muestra el estado de las unidades vinculadas al cliente. La edición está limitada según permisos del rol CLIENT.',
      },
    ],
  },
];

export function resolveHelpTopicId(
  currentView: string,
  selectedUnitId: string | null
): HelpTopic['id'] {
  if (currentView === 'units' && selectedUnitId) return 'unit-detail';
  const match = HELP_TOPICS.find((t) => t.id === currentView);
  return match ? match.id : 'overview';
}

export function getHelpTopic(id: HelpTopic['id']): HelpTopic {
  return HELP_TOPICS.find((t) => t.id === id) ?? HELP_TOPICS[0];
}
