import * as openidClient from "openid-client";
const { Issuer, generators } = openidClient;

let _client: any;

export async function getOidcClient() {
  if (_client) return _client;
  const issuer = await Issuer.discover(process.env.OIDC_ISSUER_URL!);
  _client = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID!,
    client_secret: process.env.OIDC_CLIENT_SECRET!,
    redirect_uris: [process.env.OIDC_REDIRECT_URI!],
    response_types: ["code"]
  });
  return _client;
}

export async function startLogin(req: any, res: any) {
  const client = await getOidcClient();
  const state = generators.state();
  const nonce = generators.nonce();
  req.session.oidc_state = state;
  req.session.oidc_nonce = nonce;
  const url = client.authorizationUrl({
    scope: process.env.OIDC_SCOPES || "openid email profile",
    state,
    nonce
  });
  res.redirect(url);
}

export async function callback(req: any, res: any) {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(process.env.OIDC_REDIRECT_URI!, params, {
      state: req.session.oidc_state,
      nonce: req.session.oidc_nonce
    });
    req.session.user = tokenSet.claims(); // contains sub, email, groups, etc.
    res.redirect("/app");
  } catch (error) {
    console.error('[OIDC] Callback error:', error);
    res.status(400).json({ error: 'Authentication failed' });
  }
}