
import { ManagementStaff, ResourceType, StaffStatus, Unit, UnitStatus, User, UserRole } from "./types";

// Helper to get a future date
const getFutureDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

// Helper to generate mock roster
const generateMockRoster = (days: number, shiftPattern: 'Day' | 'Night' | 'Mixed') => {
    const roster = [];
    const today = new Date();
    // Start from beginning of current week (approx)
    today.setDate(today.getDate() - today.getDay() + 1); 
    
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        
        // Simple Logic
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        let type: any = 'OFF';
        let hours = 0;

        if (!isWeekend) {
            if (shiftPattern === 'Day') { type = 'Day'; hours = 8; }
            else if (shiftPattern === 'Night') { type = 'Night'; hours = 8; }
            else { type = i % 2 === 0 ? 'Day' : 'Night'; hours = 8; }
        } else {
             // Some weekends working
             if (Math.random() > 0.7) { type = 'Day'; hours = 8; }
        }

        roster.push({ date: dateStr, type, hours });
    }
    return roster;
};

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Admin General', email: 'admin@opsflow.com', role: 'ADMIN', avatar: 'AD' },
  { id: 'u2', name: 'Carlos Ops', email: 'carlos@opsflow.com', role: 'OPERATIONS', avatar: 'CO' },
  { id: 'u3', name: 'Cliente Visor', email: 'gerente@cliente.com', role: 'CLIENT', avatar: 'CL' },
];

export const MOCK_MANAGEMENT_STAFF: ManagementStaff[] = [
    {
        id: 'ms1',
        name: 'Roberto Gomez',
        role: 'COORDINATOR',
        email: 'roberto@opsflow.com',
        phone: '+51 999 111 222',
        photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: 'ms2',
        name: 'Ana Martinez',
        role: 'COORDINATOR',
        email: 'ana@opsflow.com',
        phone: '+51 999 333 444',
        photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: 'ms3',
        name: 'Elena Torres',
        role: 'RESIDENT_SUPERVISOR',
        email: 'elena@opsflow.com',
        phone: '+51 988 555 666',
        photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: 'ms4',
        name: 'Jorge Luis',
        role: 'RESIDENT_SUPERVISOR',
        email: 'jorge@opsflow.com',
        phone: '+51 977 777 888',
        photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: 'ms5',
        name: 'Miguel Angel',
        role: 'ROVING_SUPERVISOR',
        email: 'miguel@opsflow.com',
        phone: '+51 966 999 000',
        photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop'
    },
    {
        id: 'ms6',
        name: 'Sofia Ramirez',
        role: 'ROVING_SUPERVISOR',
        email: 'sofia@opsflow.com',
        phone: '+51 955 222 111',
        photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=200&auto=format&fit=crop'
    }
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
    coordinator: {
        id: 'ms1',
        name: 'Roberto Gomez',
        email: 'roberto@opsflow.com',
        phone: '+51 999 111 222',
        photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'
    },
    residentSupervisor: {
        id: 'ms3',
        name: 'Elena Torres',
        email: 'elena@opsflow.com',
        phone: '+51 988 555 666',
        photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop'
    },
    rovingSupervisor: {
        id: 'ms5',
        name: 'Miguel Angel',
        email: 'miguel@opsflow.com',
        phone: '+51 966 999 000',
        photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop'
    },
    blueprintLayers: [
        { id: 'bl1', name: 'Planta Baja' },
        { id: 'bl2', name: 'Sótanos' },
        { id: 'bl3', name: 'Pisos Superiores' }
    ],
    zones: [
      { 
          id: 'z1', 
          name: 'Recepción / Lobby', 
          shifts: ['Diurno', 'Nocturno'],
          area: 120,
          layout: { x: 1, y: 4, w: 4, h: 3, color: '#dbeafe', layerId: 'bl1' } // Ground Floor
      },
      { 
          id: 'z2', 
          name: 'Oficinas Piso 1-5', 
          shifts: ['Nocturno'],
          area: 450,
          layout: { x: 5, y: 1, w: 6, h: 6, color: '#f3e8ff', layerId: 'bl3' } // Upper Floors
      },
      { 
          id: 'z3', 
          name: 'Sótanos', 
          shifts: ['Diurno'],
          area: 300,
          layout: { x: 1, y: 1, w: 10, h: 6, color: '#e2e8f0', layerId: 'bl2' } // Basement
      },
      { 
        id: 'z_ext', 
        name: 'Almacén Central', 
        shifts: ['Diurno'],
        area: 45,
        layout: { x: 1, y: 1, w: 3, h: 3, color: '#ffedd5', layerId: 'bl1' } // Ground Floor
    }
    ],
    resources: [
      {
        id: 'r1',
        name: 'Juan Perez (Supervisor)',
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.ACTIVE,
        assignedZones: ['Recepción / Lobby', 'Oficinas Piso 1-5', 'Sótanos'], 
        assignedShift: 'Diurno',
        compliancePercentage: 100,
        workSchedule: generateMockRoster(14, 'Day'),
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
        assignedZones: ['Recepción / Lobby'],
        assignedShift: 'Diurno',
        compliancePercentage: 95,
        workSchedule: generateMockRoster(14, 'Day'),
        trainings: [
          { id: 't3', topic: 'Uso de Químicos Industriales', date: '2023-08-10', status: 'Completado', score: 88 }
        ],
        assignedAssets: [
          { id: 'a4', name: 'Botas de Seguridad', type: 'EPP', dateAssigned: '2023-08-01' },
          { id: 'a5', name: 'Mandil Industrial', type: 'Uniforme', dateAssigned: '2023-08-01' }
        ]
      },
      {
        id: 'r1-b',
        name: 'Pedro Castillo (Limpieza)',
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.ACTIVE,
        assignedZones: ['Sótanos', 'Almacén Central'],
        assignedShift: 'Diurno',
        compliancePercentage: 92,
        workSchedule: generateMockRoster(14, 'Mixed'),
        trainings: [],
        assignedAssets: []
      },
      {
        id: 'r1-c',
        name: 'Luisa Fernanda (Limpieza)',
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.ACTIVE,
        assignedZones: ['Oficinas Piso 1-5'],
        assignedShift: 'Nocturno',
        compliancePercentage: 98,
        workSchedule: generateMockRoster(14, 'Night'),
        trainings: [],
        assignedAssets: []
      },
      {
        id: 'r3',
        name: 'Lustradora Industrial Karcher',
        type: ResourceType.EQUIPMENT,
        quantity: 2,
        assignedZones: ['Sótanos', 'Recepción / Lobby'],
        assignedShift: 'N/A',
        nextMaintenance: getFutureDate(12),
        status: 'Operativo',
        image: 'https://images.unsplash.com/photo-1581578731117-10d52143b1e8?q=80&w=400&auto=format&fit=crop',
        maintenanceHistory: [
            {
                id: 'm1',
                date: '2023-08-15',
                type: 'Preventivo',
                description: 'Cambio de rodillos y revisión de motor.',
                technician: 'TecniClean SAC',
                status: 'Realizado',
                images: ['https://images.unsplash.com/photo-1581092921461-eab62e97a783?q=80&w=400&auto=format&fit=crop']
            },
            {
                id: 'm2',
                date: '2023-09-20',
                type: 'Supervision',
                description: 'Revisión de operatividad por supervisor de ronda. Todo OK.',
                technician: 'Miguel Angel',
                status: 'Realizado'
            }
        ]
      },
      {
        id: 'r3-b',
        name: 'Aspiradora Industrial',
        type: ResourceType.EQUIPMENT,
        quantity: 1,
        assignedZones: ['Oficinas Piso 1-5'],
        assignedShift: 'N/A',
        nextMaintenance: getFutureDate(30),
        status: 'Operativo',
        image: 'https://images.unsplash.com/photo-1527011046414-4781f1f94f8c?q=80&w=400&auto=format&fit=crop',
        maintenanceHistory: []
      },
      {
        id: 'r4',
        name: 'Detergente Industrial',
        type: ResourceType.MATERIAL,
        quantity: 50,
        unitOfMeasure: 'Litros',
        assignedZones: ['Almacén Central', 'Sótanos'],
        lastRestock: '2023-10-01',
        status: 'Stock OK',
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop'
      },
      {
        id: 'r4-b',
        name: 'Papel Higiénico Jumbo',
        type: ResourceType.MATERIAL,
        quantity: 100,
        unitOfMeasure: 'Rollos',
        assignedZones: ['Almacén Central', 'Oficinas Piso 1-5', 'Recepción / Lobby'],
        lastRestock: '2023-10-05',
        status: 'Stock Bajo',
        image: 'https://images.unsplash.com/photo-1583947581924-860b89646c8e?q=80&w=400&auto=format&fit=crop'
      }
    ],
    logs: [
      { 
        id: 'l1', 
        date: '2023-10-25', 
        type: 'Supervision', 
        description: 'Inspección de uniformes y EPPs completa. Todo conforme. Se adjuntan fotos de la formación matutina.', 
        author: 'Carlos Jefe Ops',
        responsibleIds: ['ms5', 'r1'], // Miguel Angel (Ronda) and Juan Perez (Sup)
        images: [
          'https://images.unsplash.com/photo-1581579186913-45ac3e6e3dd2?q=80&w=400&auto=format&fit=crop',
          'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=400&auto=format&fit=crop'
        ]
      },
      { id: 'l2', date: '2023-10-26', type: 'Capacitacion', description: 'Charla de seguridad sobre manejo de químicos.', author: 'Seguridad Industrial', responsibleIds: ['r2'] },
      { id: 'l3', date: '2023-10-27', type: 'Incidencia', description: 'Falta de personal por descanso médico. Se activó reemplazo (Maria Gomez).', author: 'RRHH', responsibleIds: ['ms3'] },
      { id: 'l4', date: '2023-10-28', type: 'Coordinacion', description: 'Reunión con Admin del edificio para plan de limpieza de vidrios altos.', author: 'Gerente Cuenta', responsibleIds: ['ms1'] }
    ],
    requests: [
        {
            id: 'req1',
            date: '2023-10-20',
            category: 'LOGISTICS',
            priority: 'MEDIUM',
            status: 'RESOLVED',
            description: 'Se requiere aumentar la dotación de papel higiénico para los baños del piso 2 por evento corporativo.',
            author: 'Cliente Visor',
            relatedResourceId: 'r4-b',
            response: 'Se coordinó despacho extra de 20 rollos para el evento.',
            responseAttachments: ['https://images.unsplash.com/photo-1583947581924-860b89646c8e?q=80&w=400&auto=format&fit=crop'],
            resolvedDate: '2023-10-21',
            comments: [
                { id: 'c1', author: 'Cliente Visor', role: 'CLIENT', date: '2023-10-20T10:00:00', text: 'Por favor confirmar hora de entrega.' },
                { id: 'c2', author: 'Roberto Gomez', role: 'OPERATIONS', date: '2023-10-20T10:30:00', text: 'Confirmado para las 14:00 horas.' }
            ]
        },
        {
            id: 'req2',
            date: '2023-11-05',
            category: 'PERSONNEL',
            priority: 'HIGH',
            status: 'PENDING',
            description: 'El personal de limpieza nocturna debe poner mayor atención en la sala de reuniones principal.',
            author: 'Cliente Visor',
            relatedResourceId: 'r1-c',
            comments: [],
            attachments: ['https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=400&auto=format&fit=crop']
        }
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
    blueprintLayers: [
        { id: 'bl4', name: 'Nave Central' },
        { id: 'bl5', name: 'Almacenes' }
    ],
    zones: [
      { id: 'z4', name: 'Nave de Producción', shifts: ['Turno A', 'Turno B', 'Turno C'], area: 1200, layout: { x: 1, y: 1, w: 8, h: 8, color: '#e0f2fe', layerId: 'bl4' } },
      { id: 'z5', name: 'Comedores', shifts: ['Turno A', 'Turno B'], area: 150, layout: { x: 9, y: 1, w: 3, h: 4, color: '#fef3c7', layerId: 'bl4' } }
    ],
    resources: [
      {
        id: 'r5',
        name: 'Equipo de Limpieza Pesada',
        type: ResourceType.PERSONNEL,
        quantity: 5,
        status: StaffStatus.ACTIVE,
        assignedZones: ['Nave de Producción'],
        assignedShift: 'Turno C',
        compliancePercentage: 88,
        workSchedule: generateMockRoster(14, 'Night'),
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
        assignedZones: ['Nave de Producción'],
        status: 'En Reparación',
        nextMaintenance: getFutureDate(2),
        image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?q=80&w=400&auto=format&fit=crop',
        maintenanceHistory: [
             {
                id: 'm3',
                date: '2023-10-28',
                type: 'Correctivo',
                description: 'Falla en sistema de aspiración. Se solicitó repuesto.',
                technician: 'Proveedor Externo',
                status: 'Realizado',
                images: ['https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=400&auto=format&fit=crop']
            }
        ]
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
    requests: [],
    complianceHistory: [
      { month: 'Jul', score: 92 },
      { month: 'Ago', score: 94 },
      { month: 'Sep', score: 91 },
      { month: 'Oct', score: 88 }
    ]
  }
];