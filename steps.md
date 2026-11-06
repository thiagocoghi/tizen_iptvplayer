# Documentação Técnica e Passos de Desenvolvimento - IPTV Player Tizen OS

Documento de especificação técnica e roadmap de desenvolvimento para o aplicativo IPTV Player voltado para Smart TVs Samsung (Tizen OS 5.0+ / Tizen 10.0).

---

## 1. Visão Geral da Arquitetura

O aplicativo é desenvolvido como uma **Tizen Web Application (HTML5 / CSS3 / Vanilla JS ou Framework Leve)** otimizada para controle remoto (D-Pad Navigation).

### Componentes Principais
1. **Módulo de Autenticação e Parser:**
   - Suporte a **Xtream Codes API** (`/player_api.php?username=...&password=...`).
   - Parser de arquivo **M3U / M3U8** com metadados (`#EXTINF`).
2. **Gerenciador de Mídia (AVPlay Engine):**
   - Utiliza a API nativa Samsung `webapis.avplay` para reprodução de streams (HLS/TS/MP4) com aceleração de hardware.
3. **Navegação Spatial (Remote Control Handler):**
   - Mapeamento das teclas do controle (`KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_ENTER`, `KEY_BACK`, `KEY_PLAY`, `KEY_PAUSE`).
4. **Gerenciador de Estado Local (LocalStorage / IndexedDB):**
   - Persistência das credenciais de listas.
   - Lista de **Favoritos** por categoria.
   - Histórico dos **Últimos 5 Itens Assistidos**.

---

## 2. Estrutura de Pastas Recomendada

```text
iptv-tizen-player/
│
├── config.xml                 # Configurações Tizen (Privilégios, ID, Nome, Ícones)
├── index.html                 # Ponto de entrada do aplicativo (Single Page Application)
│
├── css/
│   ├── style.css              # Estilos globais e componentes de UI
│   ├── navigation.css         # Estilos para estados de foco (focus outline / scale)
│   └── player.css             # Estilos do player de vídeo e sobreposições (EPG)
│
├── js/
│   ├── app.js                 # Inicialização do app e roteador de telas
│   ├── remote.js              # Keydown listener e navegação entre elementos focáveis
│   │
│   ├── api/
│   │   ├── xtream.js          # Métodos para consumir a API do Xtream Codes
│   │   └── m3uParser.js       # Parser para carregar e interpretar listas .m3u
│   │
│   ├── player/
│   │   └── avplay.js          # Wrapper de controle da API webapis.avplay (Samsung)
│   │
│   ├── services/
│   │   ├── storage.js         # Manipulação de LocalStorage (Listas, Favoritos, Histórico)
│   │   └── epg.js             # Obtenção e parsing dos dados do EPG
│   │
│   └── views/
│       ├── login.js           # Tela de inclusão/seleção de listas
│       ├── home.js            # Menu principal (TV, Filmes, Séries, Config, Últimos Vistos)
│       ├── livetv.js          # Layout de Categorias + Canais + Preview + EPG
│       ├── movies.js          # Layout de Categorias + Filmes + Detalhes/Capa
│       ├── series.js          # Layout de Categorias + Séries + Temporadas + Episódios
│       └── favorites.js       # Tela de Favoritos categorizados
│
└── assets/
    ├── icons/                 # Ícones da interface (TV, Filmes, Séries, Config, Star, etc.)
    └── images/                # Logo e placeholders
```

---

## 3. Especificação das Telas e Fluxo de Navegação

```
 [Tela de Config / Login]
           │
           ▼
     [Home Page] ◄────────────────────────────────────────┐
   ├── Live TV ──────► [Categorias] ──► [Canais] ──► [Preview + EPG] ──► [Full Player]
   ├── Filmes ───────► [Categorias] ──► [Grid Filmes] ──► [Capa + Descrição] ──► [Player]
   ├── Séries ───────► [Categorias] ──► [Grid Séries] ──► [Temporadas] ──► [Episódios + Descrição] ──► [Player]
   ├── Favoritos ────► [Seletor TV / Filmes / Séries] ──► [Acesso Direto]
   └── Configurações
           │
           ▼
[Últimos 5 Assistidos] (Atalho no rodapé da Home)
```

### 3.1. Tela Inicial (Home)
- **Menu Principal:**
  - Ícone **Live TV**
  - Ícone **Filmes**
  - Ícone **Séries**
  - Ícone **Favoritos**
  - Ícone **Configurações** (Incluir/Editar/Trocar listas)
- **Seção Inferior:** Carrossel/Lista dos **Últimos 5 Itens Assistidos** com atalho rápido para dar Play.

### 3.2. Live TV
- **Coluna 1 (Esquerda):** Lista de Categorias vindas da lista.
- **Coluna 2 (Centro):** Canais da categoria selecionada (com ícone indicando se é favorito).
- **Coluna 3 (Direita):** 
  - Player em formato Miniatura (Preview do canal selecionado).
  - Painel inferior ao player com o **EPG** (Programa atual, barra de progresso do horário e próximos programas).
- **Ação Enter:** Tela cheia no Player.
- **Ação Tecla Específica (ex: Botão Amarelo/Favorito):** Salva o canal na lista de Favoritos de Live TV.

### 3.3. Filmes (VOD)
- **Painel de Categorias:** Navegação lateral por gênero/categoria.
- **Grid de Filmes:** Exibe as capas do conteúdo.
- **Painel de Detalhes (ao selecionar um filme):**
  - Poster/Capa em alta resolução.
  - Título, Sinopse, Ano, Duração, Gênero.
  - Botão **Assistir**.
  - Botão **Adicionar aos Favoritos** (Filmes).

### 3.4. Séries
- **Nível 1:** Categorias de Séries.
- **Nível 2:** Grid de Séries da categoria.
- **Nível 3 (Detalhes da Série):** 
  - Sinopse, Capa e Seletor de Temporadas (Temporada 1, Temporada 2...).
- **Nível 4 (Lista de Episódios):**
  - Lista com número e título do episódio.
  - Painel de exibição com a breve descrição/sinopse do episódio selecionado.
- **Ação de Favorito:** Pode-se favoritar a Série inteira. Nos **Favoritos de Séries**, ao clicar no item salvo, o app abre diretamente a tela de Temporadas/Episódios.

### 3.5. Favoritos (Divididos por Categoria)
- **Aba TV:** Lista dos canais marcados como favoritos.
- **Aba Filmes:** Lista dos filmes marcados como favoritos.
- **Aba Séries:** Lista das séries favoritadas (dá acesso direto aos episódios).

### 3.6. Configurações & Gestão de Listas
- Formulário para adicionar novos acessos:
  - **Tipo Xtream:** Server URL, Usuário, Senha.
  - **Tipo M3U:** URL direta do arquivo `.m3u` / `.m3u8`.
- Alternância entre listas cadastradas.

---

## 4. Estrutura de Dados e Persistência (LocalStorage)

### 4.1. Configuração de Contas (`iptv_accounts`)
```json
[
  {
    "id": "acc_169823490",
    "name": "Minha Lista Principal",
    "type": "xtream",
    "url": "http://servidor.com:8080",
    "username": "user123",
    "password": "pass123"
  }
]
```

### 4.2. Estrutura de Favoritos (`iptv_favorites`)
```json
{
  "live": [
    { "stream_id": 1024, "name": "Globo HD", "logo": "http://..." }
  ],
  "movies": [
    { "stream_id": 5012, "title": "Inception", "poster": "http://..." }
  ],
  "series": [
    { "series_id": 304, "title": "Breaking Bad", "cover": "http://..." }
  ]
}
```

### 4.3. Estrutura dos Últimos Assistidos (`iptv_recent_history`)
*Limitado estritamente aos últimos 5 itens.*
```json
[
  {
    "type": "movie",
    "id": 5012,
    "title": "Inception",
    "cover": "http://...",
    "watched_at": "2026-11-05T09:00:00Z"
  },
  {
    "type": "live",
    "id": 1024,
    "title": "Globo HD",
    "logo": "http://...",
    "watched_at": "2026-11-05T08:30:00Z"
  }
]
```

---

## 5. Roteiro de Implementação (Passo a Passo)

### Fase 1: Setup e Configuração do Projeto
- [ ] Criar o projeto Tizen Web Application no Tizen Studio.
- [ ] Ajustar `config.xml` com privilégios de rede (`http://tizen.org/privilege/internet`, `http://tizen.org/privilege/tv.window`).
- [ ] Mapear as chaves de controle remoto no `remote.js` usando `tizen.tvinput.registerKey()`.

### Fase 2: Integração de API e Parsing
- [ ] Implementar o módulo `xtream.js` para consumir:
  - Auth: `/player_api.php?username=X&password=Y`
  - Live TV: `action=get_live_categories` e `action=get_live_streams`
  - VOD: `action=get_vod_categories` e `action=get_vod_streams`
  - Séries: `action=get_series_categories`, `action=get_series` e `action=get_series_info&series_id=Z`
- [ ] Implementar o módulo `m3uParser.js` para fallback de arquivo raw.

### Fase 3: Desenvolvimento da Interface e D-Pad Navigation
- [ ] Construir o CSS com suporte a foco visual (ex: `.focusable:focus` com bordas realçadas/escala).
- [ ] Desenvolver o algoritmo de navegação direcional por matriz/coordenadas para o controle remoto.
- [ ] Criar o Layout da **Home** com o menu principal e a linha de "Últimos Assistidos".
- [ ] Criar a view de **Live TV** (Categorias, Canais, Mini Player e EPG).
- [ ] Criar as views de **Filmes** e **Séries** (Categorias, Grid, Detalhes e Lista de Episódios).

### Fase 4: Reprodução de Vídeo (AVPlay Integration)
- [ ] Configurar o `avplay.js` para gerenciar a instância de vídeo Tizen:
  - `webapis.avplay.open(url)`
  - `webapis.avplay.setDisplayRect(x, y, width, height)` (para alternar entre Mini-Preview e Fullscreen)
  - `webapis.avplay.prepare()` e `webapis.avplay.play()`
- [ ] Tratar erros de stream/timeout e ajustar buffer.

### Fase 5: Regras de Negócio
- [ ] Salvar e remover itens dos **Favoritos** por categoria.
- [ ] Atualizar dinamicamente a fila dos **Últimos 5 Itens Assistidos** ao iniciar qualquer reprodução.
- [ ] Integrar busca de EPG para o canal selecionado no painel do Live TV.

---

## 6. Recursos Essenciais da API Tizen (`config.xml`)

Garantir que as seguintes permissões estejam presentes no `config.xml`:

```xml
<tizen:privilege name="http://tizen.org/privilege/internet"/>
<tizen:privilege name="http://tizen.org/privilege/tv.window"/>
<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
```

---

## 7. Enhancements (Melhorias Pendentes)

Itens identificados após a conclusão da versão funcional. Ordem sugerida de implementação: **E5 (base de configurações) → E4 (fonte) → E6 (i18n) → E1 (progresso) → E2 (assistido) → E3 (auto-play)**, pois E3 depende de E1 e E2, e E4/E6 dependem da camada de configurações.

### E1. Persistência de sessão — "Continuar assistindo" (enhancement)
Ao interromper um filme ou episódio no meio, o usuário deve poder escolher entre **começar do início** ou **continuar de onde parou**.

- [ ] Criar o armazenamento `iptv_playback_progress` em `storage.js`, indexado por `"{tipo}:{id}"` (ex.: `movie:5012`, `series:304:S1E3`), com `{ position_ms, duration_ms, percent, updated_at }`.
- [ ] Em `avplay.js`, salvar a posição periodicamente (a cada ~5s) e também ao pausar, fechar (`close`) ou sair do app. Live TV não entra nessa persistência.
- [ ] Ao abrir um filme ou episódio com progresso parcial (ex.: entre 2% e 95%), exibir um diálogo "Continuar de MM:SS" / "Começar do início".
- [ ] Aplicar a posição salva após o `prepare` (`webapis.avplay.seekTo(ms)` ou `htmlVideo.currentTime`).
- [ ] Mostrar barra de progresso fina sobre a capa de filmes e episódios já iniciados.
- [ ] Critério de aceite: parar um filme aos 40 min e reabri-lo permite retomar em 40 min ou começar do zero.

### E2. Registro de progresso — marcar episódio como assistido (enhancement)
Quando um episódio é reproduzido até o fim, ele deve ficar marcado como assistido.

- [ ] Criar o armazenamento `iptv_watched` (conjunto de chaves `series:{seriesId}:S{temporada}E{episodio}` e `movie:{id}`).
- [ ] Marcar como assistido ao atingir **≥ 95%** da duração ou no evento `ended`/`onstreamcompleted`.
- [ ] Exibir indicador visual (ícone de check / opacidade reduzida) na lista de episódios de `series.js` e na grade de filmes.
- [ ] Permitir alternar manualmente "marcar como assistido / não assistido" com a tecla amarela ou botão dedicado.
- [ ] Ao reproduzir, o progresso do episódio é atualizado em `iptv_playback_progress` (ver E1).

### E3. Auto-play do próximo episódio (enhancement)
Ao terminar um episódio, se houver outro depois dele (na mesma temporada ou na próxima), o app deve reproduzi-lo automaticamente após uma contagem regressiva.

- [ ] Ao receber `ended`, calcular o próximo episódio a partir de `getSeriesInfo` (ordem por temporada e número) e ignorar se for o último da série.
- [ ] Exibir overlay sobre o player com a mensagem "Reproduzir próximo em 3… 2… 1…", com título do próximo episódio e botões **Reproduzir agora** / **Cancelar**.
- [ ] Tecla BACK ou "Cancelar" interrompe a contagem e volta à tela de episódios.
- [ ] Ao zerar a contagem, chamar `App.playEpisode(series, nextEpisode, season)` e marcar o episódio anterior como assistido (E2).
- [ ] Adicionar opção "Reprodução automática" (ligada por padrão) em Configurações (E5).

### E4. Tamanho da fonte adaptável à tela (enhancement)
Problema relatado: em TV de 32" os textos dos menus ficam pequenos demais para leitura a distância. Hoje os tamanhos são fixos em `px` em `css/style.css` (ex.: 13px, 14px, 15px, 17px, 20px), sem escala global.

- [ ] Definir a escala base no `:root` com `font-size` em `rem` (ou `calc(Npx * var(--ui-scale))`) e converter os `font-size` fixos de `style.css`, `navigation.css` e `player.css` para unidades relativas.
- [ ] Ajustar a escala automaticamente conforme a resolução (`window.innerWidth`/`innerHeight`) para que TVs de 32" a 55" tenham textos proporcionais, com um valor base maior para TVs de 32" a distância de sofá.
- [ ] Testar que o layout em 1920×1080 não quebra com textos maiores (listas com `scroll`, truncamento de títulos longos com `text-overflow: ellipsis`).
- [ ] Garantir que o player (legendas, EPG, painel de controles) acompanhe a mesma escala.

### E5. Configurações — preferências do usuário (enhancement)
Nova seção "Preferências" na tela de Configurações, separada da gestão de listas.

- [ ] Criar `iptv_settings` em `storage.js` com `{ fontScale, language, autoplay }` e valores padrão.
- [ ] Opção **Tamanho da fonte**: Pequeno (100%), Médio (125%), Grande (150%), Extra grande (175%). Aplicar imediatamente sem reiniciar o app.
- [ ] Opção **Idioma**: Português (PT), English (EN) e Español (ES) — ver E6.
- [ ] Opção **Reprodução automática do próximo episódio** (ligada/desligada) — ver E3.
- [ ] Reorganizar `views/config.js` com abas ou subtítulos para separar "Listas" e "Preferências", mantendo a navegação D-Pad.

### E6. Internacionalização (PT / EN / ES) (enhancement)
Hoje todos os textos da interface estão fixos em português, espalhados em `app.js`, `home.js`, `livetv.js`, `movies.js`, `series.js`, `favorites.js`, `config.js`, `login.js` e `index.html`.

- [ ] Criar `js/services/i18n.js` com dicionários `pt`, `en` e `es` e a função `t(chave, params)` com fallback para `pt`.
- [ ] Substituir os textos fixos das views pelas chaves de tradução (ex.: "Continuar assistindo", "Começar do início", "Reproduzir próximo em", "Nenhum resultado", mensagens de erro e toasts).
- [ ] Marcar os textos estáticos de `index.html` com `data-i18n` e aplicá-los na inicialização.
- [ ] Atualizar `<html lang>` conforme o idioma escolhido.
- [ ] Formatar datas e horas conforme o idioma (`Intl.DateTimeFormat` com o locale correspondente).
- [ ] Trocar o idioma re-renderiza a tela atual sem perder o foco.
- [ ] Observação: nomes de canais, filmes e sinopses vêm do provedor da lista e não são traduzidos.

---

O arquivo `steps.md` foi gerado e está pronto para ser baixado e utilizado como guia técnico no desenvolvimento da sua aplicação.

Se precisar da implementação de algum dos módulos (como a integração com a API do Xtream Codes ou o gerenciador de controle remoto em JavaScript), é só me avisar!