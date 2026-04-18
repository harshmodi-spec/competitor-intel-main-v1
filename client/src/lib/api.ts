const BASE_URL = "http://localhost:3001";

export async function getCompanies(peerGroup?: string) {
  const url = peerGroup
    ? `${BASE_URL}/companies?peerGroup=${peerGroup}`
    : `${BASE_URL}/companies`;
  const res = await fetch(url);
  return res.json();
}
