'use strict';
// Offline erzeugter Vertrauensanker. Der private Schlüssel gehört niemals in Bot, Website oder Release.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAXV3lYlN+oJZT4VSi+gC3qkcit8xQrmHHf93puLsMe3w=
-----END PUBLIC KEY-----
`;
const RELEASE_BASE_URL = 'https://api-v2.appdeploy.ai/app/novora-verify-control-center-ae02zt/api';
module.exports = { PUBLIC_KEY, RELEASE_BASE_URL };
