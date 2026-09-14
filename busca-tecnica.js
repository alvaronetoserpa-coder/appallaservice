/* ================= /api/busca-tecnica.js =================
   Backend REAL de pesquisa na internet para o Assistente Técnico IA.
   Esta função roda no servidor (Vercel Serverless Function) — o
   navegador do técnico nunca vê a chave de API, e a busca é feita de
   verdade contra a Google Custom Search API.

   IMPORTANTE — o que você precisa fazer para isto funcionar:
   Este código, sozinho, NÃO pesquisa nada ainda. Faltam duas peças que
   só você pode obter (eu não tenho como criar isso por você):

   1) Uma "Programmable Search Engine" do Google (gratuita até 100
      buscas/dia):
        a) Acesse: https://programmablesearchengine.google.com/
        b) Crie um mecanismo de busca novo, com "Pesquisar em toda a
           internet" ativado.
        c) Copie o "ID do mecanismo de pesquisa" (Search engine ID) —
           é o valor de GOOGLE_SEARCH_CX abaixo.

   2) Uma chave de API do Google Custom Search:
        a) Acesse: https://console.cloud.google.com/apis/credentials
        b) Ative a "Custom Search API" no seu projeto Google Cloud.
        c) Crie uma chave de API — é o valor de GOOGLE_SEARCH_API_KEY.

   3) No painel da Vercel do seu projeto:
        Settings → Environment Variables → adicione:
          GOOGLE_SEARCH_API_KEY = <sua chave>
          GOOGLE_SEARCH_CX      = <seu search engine id>
        Depois, redeploy o projeto (a Vercel não aplica variáveis novas
        em um deploy já existente).

   Sem essas duas variáveis configuradas, esta função responde
   honestamente com "não configurado" (HTTP 501) — o Assistente já
   sabe tratar isso e avisa ao técnico que a pesquisa não está
   disponível, em vez de fingir que buscou algo. */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "method_not_allowed" });
  }

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    // Honesto: diz exatamente por que a busca não está disponível, sem
    // tentar simular um resultado.
    return res.status(501).json({
      erro: "nao_configurado",
      mensagem: "Pesquisa na internet ainda não configurada neste servidor (faltam as variáveis GOOGLE_SEARCH_API_KEY e GOOGLE_SEARCH_CX).",
    });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ erro: "query_invalida" });
  }

  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "6");

    const controle = new AbortController();
    const tempoLimite = setTimeout(() => controle.abort(), 9000);
    const resp = await fetch(url.toString(), { signal: controle.signal });
    clearTimeout(tempoLimite);

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      console.error("Falha na Custom Search API:", resp.status, corpo.slice(0, 300));
      return res.status(502).json({ erro: "falha_busca", status: resp.status });
    }

    const dados = await resp.json();
    const itens = Array.isArray(dados.items) ? dados.items : [];

    // Prioriza fontes que parecem manuais/documentação oficial, sem
    // inventar nada — só reordena e classifica o que a própria busca já
    // retornou, usando o domínio e palavras-chave do próprio resultado.
    const DOMINIOS_FABRICANTES = ["lg.com", "samsung.com", "midea.com", "springer.com.br", "gree.com", "fujitsu-general.com", "daikin.com", "carrier.com", "electrolux.com.br", "hisense.com", "tcl.com", "elgin.com.br", "philco.com.br", "consul.com.br", "agratto.com.br"];
    const palavrasManual = ["manual", "service manual", ".pdf", "service-manual", "download"];
    const palavrasOficial = ["support", "official", "oficial", "suporte"];

    const classificar = (item) => {
      const url = (item.link || "").toLowerCase();
      const titulo = (item.title || "").toLowerCase();
      const alvo = `${url} ${titulo}`;
      const dominio = (() => {
        try { return new URL(item.link).hostname.replace(/^www\./, ""); } catch { return item.link || ""; }
      })();
      const ehFabricante = DOMINIOS_FABRICANTES.some((d) => dominio.includes(d));
      const ehManual = palavrasManual.some((p) => alvo.includes(p));
      const ehOficial = ehFabricante || palavrasOficial.some((p) => alvo.includes(p));

      let tipoFonte = "Fonte técnica complementar";
      let confiabilidade = "média";
      let pontos = 0;
      if (ehFabricante && ehManual) { tipoFonte = "Manual oficial do fabricante"; confiabilidade = "alta"; pontos = 3; }
      else if (ehManual) { tipoFonte = "Manual / Service Manual"; confiabilidade = "alta"; pontos = 2; }
      else if (ehOficial) { tipoFonte = "Site oficial do fabricante"; confiabilidade = "alta"; pontos = 2; }
      else if (/forum|reddit|blog/.test(dominio)) { tipoFonte = "Fórum / blog"; confiabilidade = "baixa"; pontos = 0; }
      else { pontos = 1; }

      return { dominio, tipoFonte, confiabilidade, pontos };
    };

    const resultados = itens
      .map((item) => {
        const c = classificar(item);
        return {
          titulo: item.title || item.link,
          url: item.link,
          trecho: item.snippet || "",
          fonte: c.dominio,
          tipoFonte: c.tipoFonte,
          confiabilidade: c.confiabilidade,
          _pontos: c.pontos,
        };
      })
      .sort((a, b) => b._pontos - a._pontos)
      .slice(0, 5)
      .map(({ _pontos, ...resto }) => resto);

    return res.status(200).json({ resultados, totalEncontrado: itens.length });
  } catch (e) {
    console.error("Erro ao consultar a Custom Search API:", e.message);
    return res.status(502).json({ erro: "falha_conexao", detalhe: e.name === "AbortError" ? "timeout" : e.message });
  }
}
