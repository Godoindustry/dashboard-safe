export const FRONT_LABELS = Object.freeze({
  safety: "Inspeção de Segurança",
  actions: "Plano de Ação",
  machines: "Máquinas/Injetoras",
  cipa: "CIPA",
  brigade: "Brigada",
  training: "Treinamentos/DDS",
  epi: "EPI",
  forklifts: "Empilhadeiras",
  ergonomics: "Ergonomia",
  contractors: "Terceiros",
  emergencies: "Emergências",
  documents: "Documentação SST",
});

export function validFront(value) {
  const key = String(value || "").trim();
  return Object.hasOwn(FRONT_LABELS, key) ? key : "";
}
