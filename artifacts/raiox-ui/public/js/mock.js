// Mock data + lifecycle generator for development.

export const MOCK_PREDICTIONS = [
  { place_id: "ChIJSTUB_casa_januario", name: "Casa Januário",
    address: "Rua Cedofeita 348, 4050-174 Porto", category: "grocery_store" },
  { place_id: "ChIJSTUB_pinguim_cafe", name: "Pinguim Café",
    address: "Rua Galeria de Paris, Sé, Porto", category: "cafe" },
  { place_id: "ChIJSTUB_moutinho", name: "Moutinho Ópticas",
    address: "Rua Cedofeita, Porto", category: "store" },
];

export const MOCK_RESULT = {
  shop: {
    name: "Casa Januário",
    address: "Rua Cedofeita 348, 4050-174 Porto",
    place_id: "ChIJSTUB_casa_januario",
  },
  axes: [
    {
      name: "Visibilidade",
      summary: "Já tens presença em múltiplos canais — site com loja online, Instagram, Facebook, Comércio com História e até a Time Out te citou. A maior oportunidade está em crescer no Instagram: 1 522 seguidores é pouco para uma loja com esta notoriedade.",
      recommendations: [
        { action: "Activa o Instagram com um post por semana centrado num produto icónico ou numa história da loja — a longevidade de 100 anos é conteúdo que se escreve sozinho." },
        { action: "Confirma que o horário no Google Maps está actualizado e bate certo com o do Comércio com História." },
      ],
      evidence_count: 6,
    },
    {
      name: "Reputação",
      summary: "Já tens 87 avaliações no Google com 4.3 estrelas e menções editoriais na Time Out e JN. A maior oportunidade está em responder publicamente às reviews — agora não há respostas tuas a 5 reviews recentes, e isso muda a leitura para quem chega.",
      recommendations: [
        { action: "Responde às próximas 10 reviews do Google com uma frase personalizada que mencione o produto ou o momento descrito pelo cliente." },
        { action: "Pede a 5 clientes habituais por semana que deixem uma review no Google — uma frase chega." },
      ],
      evidence_count: 87,
    },
    {
      name: "Consistência",
      summary: "Já tens uma narrativa coerente — mercearia fina desde 1926, terceira geração — em todos os directórios. A maior oportunidade está em dois detalhes: a imagem de partilha do site está em falta e o número da porta difere entre fontes (348 vs 352).",
      recommendations: [
        { action: "Adiciona uma og:image ao site — quando alguém partilha o link no WhatsApp, aparece uma caixa cinzenta sem imagem em vez de uma foto da loja." },
        { action: "Confirma e unifica o número da porta (348 ou 352) no Google Maps, no site e no Facebook." },
      ],
    },
  ],
  lab_hint: "lab_2",
  generated_at: "2026-05-15T14:30:00Z",
  model_variant: "sonnet",
};

const MOCK_TIMELINE = [
  { atSec: 0,  text: "A encontrar a Casa Januário em Cedofeita…", stage: "identifying" },
  { atSec: 2,  text: "87 reviews no Google — boa tracção.", stage: "scanning_google",
    data: { reviews_count: 87, rating: 4.3 } },
  { atSec: 4,  text: "Encontrei-te no Comércio com História.", stage: "scanning_web",
    data: { source_found: "Comércio com História" } },
  { atSec: 6,  text: "Site activo — casajanuario.pt", stage: "scanning_site",
    data: { site_url: "https://casajanuario.pt", facebook_followers: 8849 } },
  { atSec: 8,  text: "Instagram: 1 522 seguidores, 449 publicações.", stage: "scanning_instagram",
    data: { instagram_followers: 1522, instagram_posts: 449, last_post_days_ago: 23 } },
  { atSec: 10, text: "Time Out nomeou a tua rua a 3.ª mais cool do mundo.", stage: "scanning_web",
    data: { source_found: "Time Out Coolest Streets" } },
  { atSec: 12, text: "A juntar tudo numa análise…", stage: "synthesizing" },
];

const sessions = new Map(); // sid → { startedAt }

export function mockStartDiagnostic(sid) {
  sessions.set(sid, { startedAt: Date.now() });
  return { sid, cached: false, poll_url: `/api/status?sid=${sid}` };
}

export function mockStatus(sid) {
  const s = sessions.get(sid) ?? { startedAt: Date.now() };
  if (!sessions.has(sid)) sessions.set(sid, s);
  // Debug: ?fast=1 compresses the lifecycle 10× for visual QA / screenshots.
  const speed = (() => {
    try { return new URL(window.location.href).searchParams.get("fast") === "1" ? 10 : 1; }
    catch { return 1; }
  })();
  const elapsedSec = ((Date.now() - s.startedAt) / 1000) * speed;
  const progress = MOCK_TIMELINE
    .filter((p) => p.atSec <= elapsedSec)
    .map((p) => ({ ts: new Date(s.startedAt + p.atSec * 1000).toISOString(),
                   text: p.text, stage: p.stage, data: p.data }));
  if (progress.length === 0) {
    progress.push({ ts: new Date().toISOString(),
                    text: "A encontrar a Casa Januário em Cedofeita…",
                    stage: "identifying" });
  }
  if (elapsedSec >= 15) {
    return { sid, state: "done", progress, result: MOCK_RESULT };
  }
  return { sid, state: "running", progress };
}

export function mockResult() { return MOCK_RESULT; }
