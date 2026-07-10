import { supabase } from './supabase';
import { verifyPassword } from '../utils/passwordHash';
import { UserRole } from '../types';

/** Máximo de días calendario que un usuario puede otorgar sin autorización de otro */
export const MAX_VACATION_DAYS_WITHOUT_AUTH = 7;

const AUTHORIZER_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATIONS_SUPERVISOR',
  'OPERATIONS',
];

export interface VerifiedAuthorizer {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export function requiresVacationAuthorization(calendarDays: number): boolean {
  return calendarDays > MAX_VACATION_DAYS_WITHOUT_AUTH;
}

export function canActAsVacationAuthorizer(role: UserRole): boolean {
  return AUTHORIZER_ROLES.includes(role);
}

export function toVerifiedAuthorizer(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}): VerifiedAuthorizer {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

/**
 * Verifica credenciales de un segundo usuario sin cambiar la sesión activa.
 * @deprecated Usar flujo asíncrono de solicitudes de autorización.
 */
export async function verifyVacationAuthorizer(
  authorizerUserId: string,
  password: string,
  requesterUserId: string
): Promise<VerifiedAuthorizer> {
  if (!authorizerUserId || !password?.trim()) {
    throw new Error('Debe seleccionar un autorizador e ingresar su contraseña');
  }
  if (authorizerUserId === requesterUserId) {
    throw new Error('El autorizador debe ser un usuario diferente al solicitante');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, password_hash')
    .eq('id', authorizerUserId)
    .maybeSingle();

  if (error || !user) {
    throw new Error('Usuario autorizador no encontrado');
  }

  const role = user.role as UserRole;
  if (!canActAsVacationAuthorizer(role)) {
    throw new Error('El usuario seleccionado no puede autorizar operaciones de vacaciones');
  }
  if (!user.password_hash) {
    throw new Error('El autorizador no tiene contraseña configurada en el sistema');
  }

  const valid = await verifyPassword(password, String(user.password_hash).trim());
  if (!valid) {
    throw new Error('Contraseña del autorizador incorrecta');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
  };
}
