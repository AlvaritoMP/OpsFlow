import { ResourceType, StaffStatus, Unit, UnitStatus, User, UserRole } from "./types";

// Helper to get a future date
const getFutureDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Admin General', email: 'admin@opsflow.com', role: 'ADMIN', avatar: 'AD' },
  { id: 'u2', name: 'Carlos Ops', email: 'carlos@opsflow.com', role: 'OPERATIONS', avatar: 'CO' },
  { id: 'u3', name: 'Cliente Visor', email: 'gerente@cliente.com', role: 'CLIENT', avatar: 'CL' },
];

export const MOCK_UNITS: Unit[] = [
  {
    id: 'u1',
    name: 'Torre Empresarial Alpha',
    clientName: 'Grupo Financiero Horizonte',
    address: 'Av. Javier Prado 450, Lima',
    status: UnitStatus.ACTIVE,
    description: 'Edificio corporativo de 25 pisos con certificación LEED. Servicio integral de limpieza y mantenimiento menor.',
    images: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop', // Cover
      'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=800&auto=format&fit=crop'
    ],
    zones: [
      { id: 'z1', name: 'Recepción / Lobby', shifts: ['Diurno', 'Nocturno'] },
      { id: 'z2', name: 'Oficinas Piso 1-5', shifts: ['Nocturno'] },
      { id: 'z3', name: 'Sótanos', shifts: ['Diurno'] }
    ],
    resources: [
      {
        id: 'r1',
        name: 'Juan Perez (Supervisor)',
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.ACTIVE,
        assignedZone: 'General',
        assignedShift: 'Diurno',
        compliancePercentage: 100,
        trainings: [
          { id: 't1', topic: 'Liderazgo de Equipos', date: '2023-09-15', status: 'Completado', score: 95 },
          { id: 't2', topic: 'Seguridad y Salud en el Trabajo', date: getFutureDate(5), status: 'Programado' }
        ],
        assignedAssets: [
          { id: 'a1', name: 'Laptop Lenovo ThinkPad', type: 'Tecnologia', dateAssigned: '2023-01-15', serialNumber: 'SN-998877' },
          { id: 'a2', name: 'Celular Corporativo', type: 'Tecnologia', dateAssigned: '2023-01-15' },
          { id: 'a3', name: 'Uniforme Completo (Supervisor)', type: 'Uniforme', dateAssigned: '2023-06-01' }
        ]
      },
      {
        id: 'r2',
        name: 'Maria Gomez (Operaria)',
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.REPLACED,
        assignedZone: 'Recepción / Lobby',
        assignedShift: 'Diurno',
        compliancePercentage: 95,
        trainings: [
          { id: 't3', topic: 'Uso de Químicos Industriales', date: '2023-08-10', status: 'Completado', score: 88 }
        ],
        assignedAssets: [
          { id: 'a4', name: 'Botas de Seguridad', type: 'EPP', dateAssigned: '2023-08-01' },
          { id: 'a5', name: 'Mandil Industrial', type: 'Uniforme', dateAssigned: '2023-08-01' }
        ]
      },
      {
        id: 'r3',
        name: 'Lustradora Industrial Karcher',
        type: ResourceType.EQUIPMENT,
        quantity: 2,
        assignedZone: 'Sótanos',
        assignedShift: 'N/A',
        nextMaintenance: getFutureDate(12),
        status: 'Operativo',
        image: 'https://images.unsplash.com/photo-1581578731117-10d52143b1e8?q=80&w=400&auto=format&fit=crop'
      },
      {
        id: 'r4',
        name: 'Detergente Industrial',
        type: ResourceType.MATERIAL,
        quantity: 50,
        unitOfMeasure: 'Litros',
        assignedZone: 'Almacén Central',
        lastRestock: '2023-10-01',
        status: 'Stock OK',
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop'
      }
    ],
    logs: [
      { 
        id: 'l1', 
        date: '2023-10-25', 
        type: 'Supervision', 
        description: 'Inspección de uniformes y EPPs completa. Todo conforme. Se adjuntan fotos de la formación matutina.', 
        author: 'Carlos Jefe Ops',
        images: [
          'https://images.unsplash.com/photo-1581579186913-45ac3e6e3dd2?q=80&w=400&auto=format&fit=crop',
          'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=400&auto=format&fit=crop'
        ]
      },
      { id: 'l2', date: '2023-10-26', type: 'Capacitacion', description: 'Charla de seguridad sobre manejo de químicos.', author: 'Seguridad Industrial' },
      { id: 'l3', date: '2023-10-27', type: 'Incidencia', description: 'Falta de personal por descanso médico. Se activó reemplazo (Maria Gomez).', author: 'RRHH' },
      { id: 'l4', date: '2023-10-28', type: 'Coordinacion', description: 'Reunión con Admin del edificio para plan de limpieza de vidrios altos.', author: 'Gerente Cuenta' }
    ],
    complianceHistory: [
      { month: 'Jul', score: 98 },
      { month: 'Ago', score: 96 },
      { month: 'Sep', score: 99 },
      { month: 'Oct', score: 95 }
    ]
  },
  {
    id: 'u2',
    name: 'Planta Industrial Sur',
    clientName: 'Manufacturas Perú SAC',
    address: 'Carretera Panamericana Sur Km 25',
    status: UnitStatus.ISSUE,
    description: 'Planta de procesamiento de alimentos. Requiere protocolos HACCP y limpieza de maquinaria pesada.',
    images: [
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=800&auto=format&fit=crop'
    ],
    zones: [
      { id: 'z4', name: 'Nave de Producción', shifts: ['Turno A', 'Turno B', 'Turno C'] },
      { id: 'z5', name: 'Comedores', shifts: ['Turno A', 'Turno B'] }
    ],
    resources: [
      {
        id: 'r5',
        name: 'Equipo de Limpieza Pesada',
        type: ResourceType.PERSONNEL,
        quantity: 5,
        status: StaffStatus.ACTIVE,
        assignedZone: 'Nave de Producción',
        assignedShift: 'Turno C',
        compliancePercentage: 88,
        trainings: [
           { id: 't4', topic: 'Protocolos HACCP', date: '2023-09-01', status: 'Completado', score: 92 },
           { id: 't5', topic: 'Bloqueo y Etiquetado (LOTO)', date: '2023-10-05', status: 'Completado', score: 100 }
        ],
        assignedAssets: [
            { id: 'a6', name: 'Casco de Seguridad', type: 'EPP', dateAssigned: '2023-05-10' },
            { id: 'a7', name: 'Arnés de Seguridad', type: 'EPP', dateAssigned: '2023-05-10', serialNumber: 'AN-2023-X' }
        ]
      },
      {
        id: 'r6',
        name: 'Barredora Mecánica',
        type: ResourceType.EQUIPMENT,
        quantity: 1,
        assignedZone: 'Nave de Producción',
        status: 'En Reparación',
        nextMaintenance: getFutureDate(2),
        image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?q=80&w=400&auto=format&fit=crop'
      }
    ],
    logs: [
      { 
        id: 'l5', 
        date: '2023-10-28', 
        type: 'Incidencia', 
        description: 'Barredora mecánica presentó fallas en motor. Proveedor notificado.', 
        author: 'Supervisor Planta',
        images: [
           'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400&auto=format&fit=crop'
        ]
      }
    ],
    complianceHistory: [
      { month: 'Jul', score: 92 },
      { month: 'Ago', score: 94 },
      { month: 'Sep', score: 91 },
      { month: 'Oct', score: 88 }
    ]
  }
];