import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyOidcAccessToken, type OidcVerifierOptions } from "./oidc.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const options: OidcVerifierOptions = {
  issuer: "https://identity.example.test",
  audience: "cias-api",
  jwksUrl: "https://identity.example.test/.well-known/jwks.json",
  tenantClaim: "cias_tenant_id"
};

type TestKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let trustedKeys: TestKeyPair;
let untrustedKeys: TestKeyPair;
let keySet: JWTVerifyGetKey;

async function makeToken(input: {
  omitExpiration?: boolean;
  omitIssuedAt?: boolean;
  omitClientId?: boolean;
  omitJti?: boolean;
  expirationOffsetSeconds?: number;
  issuer?: string;
  audience?: string;
  typ?: string;
  signingKey?: TestKeyPair["privateKey"];
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: "external-user-42",
    client_id: "cias-web-client",
    jti: "token-id-123",
    cias_tenant_id: tenantId
  };
  if (input.omitClientId) delete payload.client_id;
  if (input.omitJti) delete payload.jti;

  const signer = new SignJWT(payload)
    .setProtectedHeader({
      alg: "RS256",
      kid: "cias-profile-test-key",
      typ: input.typ ?? "at+jwt"
    })
    .setIssuer(input.issuer ?? options.issuer)
    .setAudience(input.audience ?? options.audience);

  if (!input.omitIssuedAt) signer.setIssuedAt(now);
  if (!input.omitExpiration) {
    signer.setExpirationTime(now + (input.expirationOffsetSeconds ?? 300));
  }

  return signer.sign(input.signingKey ?? trustedKeys.privateKey);
}

describe("OIDC JWT access-token profile verification", () => {
  beforeAll(async () => {
    [trustedKeys, untrustedKeys] = await Promise.all([
      generateKeyPair("RS256"),
      generateKeyPair("RS256")
    ]);

    const publicJwk = {
      ...(await exportJWK(trustedKeys.publicKey)),
      kid: "cias-profile-test-key",
      alg: "RS256",
      use: "sig"
    };
    keySet = createLocalJWKSet({ keys: [publicJwk] });
  });

  it("accepts a correctly signed, typed access token with required claims", async () => {
    const token = await makeToken();
    const claims = await verifyOidcAccessToken(token, keySet, options);
    expect(claims).toMatchObject({
      sub: "external-user-42",
      iss: options.issuer,
      aud: options.audience,
      client_id: "cias-web-client",
      jti: "token-id-123",
      cias_tenant_id: tenantId
    });
    expect(typeof claims.exp).toBe("number");
    expect(typeof claims.iat).toBe("number");
  });

  it("rejects a signed token with no expiration claim", async () => {
    const token = await makeToken({ omitExpiration: true });
    await expect(verifyOidcAccessToken(token, keySet, options)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await makeToken({ expirationOffsetSeconds: -30 });
    await expect(verifyOidcAccessToken(token, keySet, options)).rejects.toThrow();
  });

  it("requires an issued-at claim", async () => {
    const token = await makeToken({ omitIssuedAt: true });
    await expect(verifyOidcAccessToken(token, keySet, options)).rejects.toThrow();
  });

  it("rejects a JWT that is not explicitly typed as an access token", async () => {
    const token = await makeToken({ typ: "JWT" });
    await expect(verifyOidcAccessToken(token, keySet, options)).rejects.toThrow();
  });

  it("rejects an incorrect issuer or audience", async () => {
    const wrongIssuer = await makeToken({ issuer: "https://attacker.example.test" });
    const wrongAudience = await makeToken({ audience: "another-api" });
    await expect(verifyOidcAccessToken(wrongIssuer, keySet, options)).rejects.toThrow();
    await expect(verifyOidcAccessToken(wrongAudience, keySet, options)).rejects.toThrow();
  });

  it("requires client_id and jti claims", async () => {
    const noClientId = await makeToken({ omitClientId: true });
    const noJti = await makeToken({ omitJti: true });
    await expect(verifyOidcAccessToken(noClientId, keySet, options)).rejects.toThrow();
    await expect(verifyOidcAccessToken(noJti, keySet, options)).rejects.toThrow();
  });

  it("rejects an invalid signature even when the JWT header and claims look valid", async () => {
    const token = await makeToken({ signingKey: untrustedKeys.privateKey });
    await expect(verifyOidcAccessToken(token, keySet, options)).rejects.toThrow();
  });
});
