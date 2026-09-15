import test from "node:test";
import assert from "node:assert/strict";
import { containsSensitiveAbsenceFields, rowsToObjects, transformWorkbook } from "../netlify/functions/_shared/data.mjs";
import { parseGviz } from "../netlify/functions/_shared/google-sheets.mjs";

test("converte linhas em objetos usando o primeiro cabeçalho preenchido", () => {
  const rows = [["Data", "Setor"], ["11/09/2026", "Produção"], ["", ""]];
  assert.deepEqual(rowsToObjects(rows), [{ Data: "11/09/2026", Setor: "Produção" }]);
});

test("mapeia as abas e remove dados médicos e pessoais do absenteísmo", () => {
  const result = transformWorkbook({
    inspections: [{ Data: "11/09/2026", Setor: "Produção", "Situação encontrada": "Óleo no piso", Status: "Aberta", Prioridade: "Alta", Responsável: "Pessoa A" }],
    dds: [{ Data: "10/09/2026", "Tema do DDS": "Limpeza", Participantes: "12", "Registro realizado?": "Sim" }],
    absences: [{ "Data entrevista": "09/09/2026", Colaborador: "Pessoa B", Setor: "Logística", "Qtd. dias": 2, CID: "Z00", "Motivo informado": "Dado privado", "Descrição do ocorrido": "Dado privado" }],
    pending: [],
  });
  assert.equal(result.inspections[0].sector, "Produção");
  // O painel mostra a aba inteira: Responsavel, Evidencia e Observacoes tambem no detalhe publico.
  assert.equal(result.inspections[0].owner, "Pessoa A");
  assert.equal(result.dds[0].participants, 12);
  assert.deepEqual(result.absences[0], { interviewDate: "09/09/2026", absenceDate: "", sector: "Logística", days: 2, notified: false, certificate: false, fitOnReturn: false });
  assert.equal(containsSensitiveAbsenceFields(result), false);
  assert.deepEqual(result.months, ["2026-09"]);
});

test("detalhe de relatório inclui responsável da inspeção, mas mantém absenteísmo agregado", () => {
  const result = transformWorkbook({
    inspections: [{ Data: "11/09/2026", Responsável: "Técnica", Observações: "Revisar" }],
    absences: [{ "Data entrevista": "11/09/2026", Colaborador: "Pessoa", CID: "A00", "Qtd. dias": 1 }],
  }, { detail: "report" });
  assert.equal(result.inspections[0].owner, "Técnica");
  assert.equal(result.absences[0].collaborator, undefined);
  assert.equal(containsSensitiveAbsenceFields(result), false);
});

test("interpreta resposta GViz com data", () => {
  const body = 'google.visualization.Query.setResponse({"status":"ok","table":{"cols":[{"id":"A","label":"Data"},{"id":"B","label":"Setor"}],"rows":[{"c":[{"v":Date(2026,8,11),"f":"11/09/2026"},{"v":"Produção"}]}]}});';
  assert.deepEqual(parseGviz(body), [{ Data: "11/09/2026", Setor: "Produção" }]);
});
