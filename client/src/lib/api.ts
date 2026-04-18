const BASE_URL = "http://localhost:3001";

export async function getCompanies(peerGroup?: string) {
  const url = peerGroup
    ? `${BASE_URL}/companies?peerGroup=${peerGroup}`
    : `${BASE_URL}/companies`;
  const res = await fetch(url);
  return res.json();
}

export async function uploadFile(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/upload`, { method: "POST", body: fd });
  return res.json();
}

export async function askQuestion(question: string) {
  const res = await fetch(`${BASE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return res.json();
}
