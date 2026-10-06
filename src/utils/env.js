function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Environment Variable fehlt: ${name}`);
  }

  return value;
}

module.exports = { requireEnv };
