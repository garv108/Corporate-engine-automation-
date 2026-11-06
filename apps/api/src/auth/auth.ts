import type { Request, RequestHandler } from "express";
import { z } from "zod";

const principalSchema = z.object({
  subject: z.string().min(1).max(255),
  issuer: z.string().url(),
  tenantId: z.string().uuid(),
  roles: z.array(z.string().min(1).max(100)).max(50),
  permissions: z.array(z.string().min(1).max(150)).max(200)
});

export type AuthenticatedPrincipal = z.infer<typeof principalSchema>;

/**
 * An identity adapter must verify the credential cryptographically and map the
 * verified identity to an active CIAS tenant membership before returning claims.
 * It must never derive tenant membership from an untrusted request header.
 */
export interface IdentityVerifier {
  verify(request: Request): Promise<unknown | null>;
}

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

function unauthenticated(response: Parameters<RequestHandler>[1]): void {
  response.status(401).json({
    error: { code: "UNAUTHENTICATED", message: "Authentication is required" }
  });
}

export function authenticationMiddleware(verifier: IdentityVerifier): RequestHandler {
  return async (request, response, next) => {
    try {
      const verified = await verifier.verify(request);
      const parsed = principalSchema.safeParse(verified);
      if (!parsed.success) {
        unauthenticated(response);
        return;
      }

      request.principal = parsed.data;
      next();
    } catch {
      // Do not disclose token-verification details to the caller.
      unauthenticated(response);
    }
  };
}

export const requirePrincipal: RequestHandler = (request, response, next) => {
  if (!request.principal) {
    unauthenticated(response);
    return;
  }
  next();
};

export function requirePermission(permission: string): RequestHandler {
  return (request, response, next) => {
    const principal = request.principal;
    if (!principal) {
      unauthenticated(response);
      return;
    }
    if (!principal.permissions.includes(permission)) {
      response.status(403).json({
        error: { code: "FORBIDDEN", message: "The required permission is missing" }
      });
      return;
    }
    next();
  };
}

