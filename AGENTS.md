
- Instagram via Zernio: segredos por empresa ficam em `instagram_zernio` (somente service_role), criptografados com AES-256-GCM (`secret-box.server.ts`, chave INTEGRATIONS_ENCRYPTION_KEY); o provedor ativo é `instagram_integration.instagram_provider` e `channels.server.ts` é o único ponto que escolhe Meta ou Zernio — por quê: o navegador nunca lê o segredo e todo o pipeline continua igual.
