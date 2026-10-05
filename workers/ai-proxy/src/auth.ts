import { createRemoteJWKSet, jwtVerify } from 'jose';

// Claves públicas con las que Google firma los ID tokens de Firebase Auth.
// Se crea a nivel de módulo para reutilizar la caché de claves entre peticiones
// atendidas por la misma instancia del Worker.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface VerifiedUser {
  uid: string;
  emailVerified: boolean;
}

/**
 * Verifica un ID token de Firebase Auth (firma, expiración, audiencia y emisor).
 * Lanza un error si el token no es válido.
 */
export async function verifyFirebaseToken(token: string, projectId: string): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    algorithms: ['RS256'],
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token sin uid');
  }

  return {
    uid: payload.sub,
    emailVerified: payload.email_verified === true,
  };
}

/** Extrae el token del header `Authorization: Bearer <token>`. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
