-- =============================================================================
-- Road to America | Flashcards (anki/) : esquema do banco no Supabase
--
-- Como usar: no painel do Supabase, abra SQL Editor, cole este arquivo inteiro
-- e clique em Run. O script pode ser executado de novo sem perder dados
-- (usa "if not exists" e recria funções, gatilhos e políticas).
--
-- Papéis:
--   admin        faz tudo: cria cards oficiais, revisa, aprova, rejeita,
--                promove cards da comunidade a oficiais e resolve sinalizações.
--   participante lê cards aprovados (oficial e comunidade) e os próprios;
--                cria cards pessoais (estudáveis na hora, visíveis só para ele)
--                ou envia à comunidade (entram como em_revisao); não aprova,
--                não muda status para aprovado, não edita cards oficiais nem
--                de outras pessoas; estado SRS, revlog e configurações só dele.
--
-- Para promover o primeiro administrador (rode no SQL Editor, que executa
-- como dono do banco e por isso passa pelo gatilho de proteção):
--   update public.profiles set papel = 'admin' where email = 'voce@exemplo.com';
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nome        text not null default '',
  papel       text not null default 'participante' check (papel in ('admin', 'participante')),
  criado_em   timestamptz not null default now()
);
-- Matrícula ativa: libera o banco de questões (tabela questoes). Só o admin altera.
-- Quem se cadastra pelo link mágico entra inativo; o admin ativa os alunos matriculados.
alter table public.profiles add column if not exists ativo boolean not null default false;

-- Função auxiliar: o usuário atual é administrador?
-- security definer para ler profiles sem cair na própria política RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.papel = 'admin');
$$;

-- Cria o perfil automaticamente quando alguém entra pela primeira vez
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, papel)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)), 'participante')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede escalada de papel: só um admin (ou o dono do banco, no SQL Editor,
-- quando auth.uid() é nulo) muda o campo papel.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.papel := 'participante';
    new.ativo := false;
    return new;
  end if;
  if new.papel is distinct from old.papel then
    raise exception 'Somente administradores podem alterar o papel de um usuário.' using errcode = '42501';
  end if;
  if new.ativo is distinct from old.ativo then
    raise exception 'Somente administradores ativam a matrícula.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil não pode mudar.' using errcode = '42501';
  end if;
  new.email := old.email;          -- o e-mail vem do login, não do perfil
  new.criado_em := old.criado_em;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Cards
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id                  text primary key default ('u-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  tipo                text not null default 'basico' check (tipo in ('basico', 'cloze')),
  frente              text not null check (length(frente) between 1 and 4000),
  verso               text not null default '' check (length(verso) <= 4000),
  extra               text not null default '' check (length(extra) <= 4000),
  nota_pt             text not null default '' check (length(nota_pt) <= 2000),
  sistema             text not null,
  disciplina          text not null,
  tags                text[] not null default '{}',
  rendimento          text not null default 'alto' check (rendimento in ('alto', 'medio')),
  fonte               text not null default '',
  status              text not null default 'rascunho' check (status in ('rascunho', 'em_revisao', 'aprovado', 'rejeitado')),
  baralho             text not null default 'pessoal' check (baralho in ('oficial', 'comunidade', 'pessoal')),
  autor_id            uuid references auth.users (id) on delete set null,
  autor_nome          text not null default '',
  revisor_id          uuid references auth.users (id) on delete set null,
  comentario_revisao  text,
  versao              integer not null default 1,
  origem              text not null default '',
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists cards_status_baralho_idx on public.cards (status, baralho);
create index if not exists cards_autor_idx on public.cards (autor_id);
create index if not exists cards_sistema_idx on public.cards (sistema);

-- Histórico de versões (gravado só pelo gatilho)
create table if not exists public.card_historico (
  id         bigint generated always as identity primary key,
  card_id    text not null references public.cards (id) on delete cascade,
  versao     integer not null,
  acao       text not null,
  editor_id  uuid,
  dados      jsonb not null,
  criado_em  timestamptz not null default now()
);
create index if not exists card_historico_card_idx on public.card_historico (card_id, criado_em desc);

-- Regras de escrita nos cards (mesma lógica de anki/js/permissions.js)
create or replace function public.cards_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean := public.is_admin();
  v_mudou  boolean;
  v_entrou boolean;
  v_nome   text;
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.atualizado_em := now();
    new.versao := 1;
    if v_uid is null or v_admin then
      new.autor_id := coalesce(new.autor_id, v_uid);
      return new;
    end if;
    -- participante: o id é sempre gerado pelo banco (impede ocupar de antemão
    -- o id de um card oficial que a curadoria ainda vai publicar) e o nome do
    -- autor vem do perfil (impede assinar o card com o nome de outra pessoa)
    new.id := 'u-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    new.autor_id := v_uid;
    select coalesce(nullif(p.nome, ''), split_part(coalesce(p.email, ''), '@', 1), '') into v_nome
      from public.profiles p where p.id = v_uid;
    new.autor_nome := coalesce(v_nome, '');
    if new.baralho = 'oficial' then
      raise exception 'Só administradores criam cards no baralho oficial.' using errcode = '42501';
    end if;
    if new.status in ('aprovado', 'rejeitado') then
      raise exception 'Participantes não podem aprovar nem rejeitar cards.' using errcode = '42501';
    end if;
    if new.baralho = 'pessoal' then
      new.status := 'rascunho';            -- pessoal: privado e estudável pelo autor
    elsif new.status <> 'rascunho' then
      new.status := 'em_revisao';          -- comunidade: vai para a fila de revisão
    end if;
    new.revisor_id := null;
    new.comentario_revisao := null;
    new.origem := '';
    return new;
  end if;

  -- UPDATE
  v_mudou := (new.tipo, new.frente, new.verso, new.extra, new.nota_pt, new.sistema, new.disciplina, new.tags, new.rendimento, new.fonte)
             is distinct from
             (old.tipo, old.frente, old.verso, old.extra, old.nota_pt, old.sistema, old.disciplina, old.tags, old.rendimento, old.fonte);
  new.id := old.id;
  new.criado_em := old.criado_em;
  new.atualizado_em := now();
  new.versao := case when v_mudou then old.versao + 1 else old.versao end;

  if v_uid is null or v_admin then
    return new;
  end if;

  -- participante
  if old.autor_id is distinct from v_uid then
    raise exception 'Você só pode editar os seus próprios cards.' using errcode = '42501';
  end if;
  if old.baralho = 'oficial' or new.baralho = 'oficial' then
    raise exception 'Cards oficiais só são editados pela curadoria.' using errcode = '42501';
  end if;
  if new.status = 'aprovado' and old.status <> 'aprovado' then
    raise exception 'Participantes não podem aprovar cards.' using errcode = '42501';
  end if;
  if new.status = 'rejeitado' and old.status <> 'rejeitado' then
    raise exception 'Participantes não podem rejeitar cards.' using errcode = '42501';
  end if;
  if old.baralho = 'comunidade' and old.status = 'aprovado' and new.baralho <> 'comunidade' then
    raise exception 'Um card já aprovado na comunidade não pode voltar a ser pessoal.' using errcode = '42501';
  end if;

  new.autor_id := old.autor_id;
  new.autor_nome := old.autor_nome;
  new.revisor_id := old.revisor_id;
  new.comentario_revisao := old.comentario_revisao;
  new.origem := old.origem;

  if new.baralho = 'pessoal' then
    new.status := 'rascunho';
  else
    v_entrou := old.baralho <> 'comunidade';
    if v_entrou or v_mudou or old.status = 'rejeitado' then
      -- edição de card da comunidade volta para a revisão
      new.status := case when new.status = 'rascunho' and not v_entrou then 'rascunho' else 'em_revisao' end;
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_guard on public.cards;
create trigger cards_guard
  before insert or update on public.cards
  for each row execute function public.cards_guard();

-- Grava uma versão no histórico quando o conteúdo, o status ou o baralho mudam
create or replace function public.cards_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao text;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criado';
  elsif new.versao <> old.versao then
    v_acao := 'editado';
  elsif new.baralho = 'oficial' and old.baralho <> 'oficial' then
    v_acao := 'promovido';
  elsif new.status <> old.status then
    v_acao := new.status;
  elsif new.baralho <> old.baralho then
    v_acao := 'baralho';
  else
    return null;
  end if;
  insert into public.card_historico (card_id, versao, acao, editor_id, dados)
  values (new.id, new.versao, v_acao, auth.uid(), to_jsonb(new));
  return null;
end;
$$;

drop trigger if exists cards_historico on public.cards;
create trigger cards_historico
  after insert or update on public.cards
  for each row execute function public.cards_historico();

-- ---------------------------------------------------------------------------
-- Estado FSRS por usuário e por lacuna (ord = número do cloze; 1 no básico)
-- ---------------------------------------------------------------------------
create table if not exists public.srs_estado (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id         text not null references public.cards (id) on delete cascade,
  ord             smallint not null default 1,
  due             timestamptz not null,
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    double precision not null default 0,
  scheduled_days  double precision not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  learning_steps  integer not null default 0,
  state           smallint not null default 0 check (state between 0 and 3),
  last_review     timestamptz,
  suspenso        boolean not null default false,
  leech           boolean not null default false,
  atualizado_em   timestamptz not null default now(),
  primary key (user_id, card_id, ord)
);
create index if not exists srs_estado_due_idx on public.srs_estado (user_id, due);

-- Registro de revisões (revlog), base das estatísticas e da otimização do FSRS
create table if not exists public.revlog (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id            text references public.cards (id) on delete set null,
  ord                smallint not null default 1,
  rating             smallint not null check (rating between 1 and 4),
  state              smallint not null check (state between 0 and 3),
  due                timestamptz,
  stability          double precision,
  difficulty         double precision,
  elapsed_days       double precision,
  last_elapsed_days  double precision,
  scheduled_days     double precision,
  review             timestamptz not null default now(),
  duracao_ms         integer
);
create index if not exists revlog_user_review_idx on public.revlog (user_id, review desc);

-- Erros reportados por participantes
create table if not exists public.sinalizacoes (
  id            uuid primary key default gen_random_uuid(),
  card_id       text not null references public.cards (id) on delete cascade,
  autor_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  autor_nome    text not null default '',
  motivo        text not null check (motivo in ('erro_factual', 'ambiguo', 'desatualizado', 'formatacao', 'traducao', 'outro')),
  texto         text not null default '' check (length(texto) <= 2000),
  status        text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  resposta      text not null default '',
  revisor_id    uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  resolvido_em  timestamptz
);
create index if not exists sinalizacoes_status_idx on public.sinalizacoes (status, criado_em);

-- Configurações de estudo por usuário (retenção desejada, limites etc.)
create table if not exists public.configuracoes (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dados          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- Participante só abre sinalização como "aberta"
create or replace function public.sinalizacoes_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.autor_id := auth.uid();
    new.autor_nome := coalesce((select coalesce(nullif(p.nome, ''), split_part(coalesce(p.email, ''), '@', 1))
                                  from public.profiles p where p.id = auth.uid()), '');
    new.criado_em := now();
    new.status := 'aberta';
    new.resposta := '';
    new.revisor_id := null;
    new.resolvido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sinalizacoes_guard on public.sinalizacoes;
create trigger sinalizacoes_guard
  before insert or update on public.sinalizacoes
  for each row execute function public.sinalizacoes_guard();

-- ---------------------------------------------------------------------------
-- Segurança em nível de linha (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.cards          enable row level security;
alter table public.card_historico enable row level security;
alter table public.srs_estado     enable row level security;
alter table public.revlog         enable row level security;
alter table public.sinalizacoes   enable row level security;
alter table public.configuracoes  enable row level security;

-- Nada é acessível sem login
-- No Supabase, os privilégios padrão do esquema public dão ALL (inclusive TRUNCATE,
-- que ignora a RLS) a anon e authenticated; por isso o revoke vale para os dois.
revoke all on public.profiles, public.cards, public.card_historico, public.srs_estado,
              public.revlog, public.sinalizacoes, public.configuracoes from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.cards, public.srs_estado, public.revlog,
                                        public.sinalizacoes, public.configuracoes to authenticated;
grant select on public.card_historico to authenticated;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- cards: leitura
drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards for select to authenticated
  using (
    (select public.is_admin())
    or autor_id = (select auth.uid())
    or (status = 'aprovado' and baralho in ('oficial', 'comunidade'))
  );

-- cards: criação (o gatilho cards_guard roda antes e normaliza autor e status)
drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards for insert to authenticated
  with check (
    (select public.is_admin())
    or (autor_id = (select auth.uid()) and baralho in ('pessoal', 'comunidade') and status in ('rascunho', 'em_revisao'))
  );

-- cards: edição só dos próprios, nunca oficiais (admin edita tudo)
drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards for update to authenticated
  using ((select public.is_admin()) or (autor_id = (select auth.uid()) and baralho <> 'oficial'))
  with check ((select public.is_admin()) or (autor_id = (select auth.uid()) and baralho in ('pessoal', 'comunidade')));

-- cards: exclusão dos próprios (pessoais ou ainda não aprovados)
drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards for delete to authenticated
  using (
    (select public.is_admin())
    or (autor_id = (select auth.uid()) and baralho <> 'oficial' and (baralho = 'pessoal' or status <> 'aprovado'))
  );

-- histórico: admin vê tudo; autor vê o dos próprios cards
drop policy if exists card_historico_select on public.card_historico;
create policy card_historico_select on public.card_historico for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.cards c where c.id = card_historico.card_id and c.autor_id = (select auth.uid()))
  );

-- estado SRS, revlog e configurações: só do próprio usuário (admin pode ler)
drop policy if exists srs_estado_select on public.srs_estado;
create policy srs_estado_select on public.srs_estado for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists srs_estado_write on public.srs_estado;
create policy srs_estado_write on public.srs_estado for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists srs_estado_update on public.srs_estado;
create policy srs_estado_update on public.srs_estado for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists srs_estado_delete on public.srs_estado;
create policy srs_estado_delete on public.srs_estado for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists revlog_select on public.revlog;
create policy revlog_select on public.revlog for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists revlog_insert on public.revlog;
create policy revlog_insert on public.revlog for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists revlog_delete on public.revlog;
create policy revlog_delete on public.revlog for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists configuracoes_all on public.configuracoes;
create policy configuracoes_all on public.configuracoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- sinalizações: participante cria e vê as suas; admin vê e resolve todas
drop policy if exists sinalizacoes_select on public.sinalizacoes;
create policy sinalizacoes_select on public.sinalizacoes for select to authenticated
  using (autor_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists sinalizacoes_insert on public.sinalizacoes;
create policy sinalizacoes_insert on public.sinalizacoes for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.id = sinalizacoes.card_id)  -- só cards que a pessoa consegue ver
  );
drop policy if exists sinalizacoes_update on public.sinalizacoes;
create policy sinalizacoes_update on public.sinalizacoes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists sinalizacoes_delete on public.sinalizacoes;
create policy sinalizacoes_delete on public.sinalizacoes for delete to authenticated
  using ((select public.is_admin()));

-- =============================================================================
-- PLATAFORMA: simulados de 30 minutos, autoavaliações NBME, presença nas aulas,
-- plano do participante e painel de rendimento do administrador.
-- Interface JavaScript correspondente: plataforma/INTERFACE.md.
--
-- Regras:
--   participante  lê só os próprios dados; grava as próprias tentativas de
--                 simulado (sem editar nem apagar depois); lança, edita e apaga
--                 as próprias autoavaliações enquanto não forem verificadas; não
--                 marca autoavaliação como verificada; só lê a presença; no plano,
--                 altera só as datas de prova.
--   admin         tudo, inclusive verificar autoavaliações, lançar presença
--                 (manual ou CSV), marcar Step aprovado e definir as metas.
-- O painel do admin lê agregados por participante pelas funções
-- r2a_admin_resumo_participantes() e r2a_meu_resumo() (security definer, com
-- checagem de papel e search_path fixo), sem expor o revlog bruto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tentativas de simulado (um bloco de 20 questões em 30 minutos)
-- ---------------------------------------------------------------------------
create table if not exists public.simulados (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step            text not null check (step in ('step1', 'step2ck')),
  modo            text not null default 'bloco_30min' check (modo in ('bloco_30min', 'livre')),
  questoes        text[] not null,
  respostas       text[] not null,
  marcadas        boolean[] not null,
  tempos_ms       integer[] not null,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  duracao_ms      integer not null check (duracao_ms between 0 and 86400000),
  limite_ms       integer not null default 1800000 check (limite_ms between 0 and 86400000),
  total           smallint not null check (total between 1 and 40),
  acertos         smallint not null,
  percentual      numeric generated always as (round(acertos::numeric / total, 4)) stored,
  em_branco       smallint not null default 0,
  por_sistema     jsonb not null default '{}'::jsonb,
  por_disciplina  jsonb not null default '{}'::jsonb,
  por_dificuldade jsonb not null default '{}'::jsonb,
  encerramento    text not null default 'participante' check (encerramento in ('participante', 'tempo')),
  versao_banco    text not null default '' check (length(versao_banco) <= 40),
  criado_em       timestamptz not null default now(),
  constraint simulados_acertos_ck check (acertos between 0 and total and em_branco between 0 and total),
  constraint simulados_tamanhos_ck check (
    cardinality(questoes) = total and cardinality(respostas) = total
    and cardinality(marcadas) = total and cardinality(tempos_ms) = total),
  constraint simulados_tempo_ck check (fim >= inicio)
);
create index if not exists simulados_user_fim_idx on public.simulados (user_id, step, fim desc);

create or replace function public.simulados_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    if auth.uid() is not null and not public.is_admin() then
      new.user_id := auth.uid();
    end if;
    if new.fim > now() + interval '5 minutes' then
      raise exception 'O fim da tentativa não pode estar no futuro.' using errcode = '22023';
    end if;
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists simulados_guard on public.simulados;
create trigger simulados_guard
  before insert or update on public.simulados
  for each row execute function public.simulados_guard();

-- ---------------------------------------------------------------------------
-- Autoavaliações oficiais do NBME (CBSSA no Step 1, CCSSA no Step 2 CK)
-- ---------------------------------------------------------------------------
create table if not exists public.nbme_autoavaliacoes (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step                        text not null check (step in ('step1', 'step2ck')),
  formulario                  text not null check (length(btrim(formulario)) between 1 and 80),
  modo                        text not null default 'standard' check (modo in ('standard', 'self', 'desconhecido')),
  data                        date not null check (data >= date '2015-01-01'),
  escore                      smallint check (escore between 1 and 999),
  escore_texto                text not null default '' check (length(escore_texto) <= 40),
  probabilidade               numeric(5,2) check (probabilidade between 0 and 100),
  faixa_acima_aprovacao_baixa boolean,
  observacao                  text not null default '' check (length(observacao) <= 1000),
  verificada                  boolean not null default false,
  verificada_por              uuid references auth.users (id) on delete set null,
  verificada_em               timestamptz,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now(),
  constraint nbme_escore_ck check (escore is not null or length(btrim(escore_texto)) > 0)
);
create index if not exists nbme_user_step_idx on public.nbme_autoavaliacoes (user_id, step, data);

create or replace function public.nbme_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_part boolean := auth.uid() is not null and not public.is_admin();
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    if v_part then
      new.user_id := auth.uid();
      new.verificada := false;
    end if;
  else
    if v_part and old.verificada then
      raise exception 'Esta autoavaliação já foi verificada pela equipe e não pode mais ser alterada.' using errcode = '42501';
    end if;
    new.id := old.id;
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
    if v_part then
      new.verificada := false;
    end if;
  end if;
  new.atualizado_em := now();
  if new.data > current_date + 2 then
    raise exception 'A data da autoavaliação não pode estar no futuro.' using errcode = '22023';
  end if;
  if new.verificada then
    if tg_op = 'INSERT' or not old.verificada then
      new.verificada_por := coalesce(auth.uid(), new.verificada_por);
      new.verificada_em := now();
    else
      new.verificada_por := old.verificada_por;
      new.verificada_em := old.verificada_em;
    end if;
  else
    new.verificada_por := null;
    new.verificada_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists nbme_guard on public.nbme_autoavaliacoes;
create trigger nbme_guard
  before insert or update on public.nbme_autoavaliacoes
  for each row execute function public.nbme_guard();

-- ---------------------------------------------------------------------------
-- Presença nas aulas (lançada pelo admin, à mão ou por CSV)
-- ---------------------------------------------------------------------------
create table if not exists public.presenca (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  aulas_assistidas  integer not null check (aulas_assistidas >= 0),
  aulas_totais      integer not null check (aulas_totais >= 0),
  origem            text not null default 'manual' check (origem in ('manual', 'csv')),
  atualizado_por    uuid references auth.users (id) on delete set null,
  atualizado_em     timestamptz not null default now(),
  constraint presenca_ck check (aulas_assistidas <= aulas_totais)
);

create or replace function public.presenca_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists presenca_guard on public.presenca;
create trigger presenca_guard
  before insert or update on public.presenca
  for each row execute function public.presenca_guard();

-- ---------------------------------------------------------------------------
-- Plano do participante: datas de prova (ele altera), aprovação, matrícula e
-- conclusão do ciclo básico (só o admin altera; definem o prazo da garantia)
-- ---------------------------------------------------------------------------
create table if not exists public.plano_participante (
  user_id                    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data_prova_step1           date,
  data_prova_step2ck         date,
  step1_aprovado             boolean not null default false,
  step2ck_aprovado           boolean not null default false,
  data_matricula             date,
  ciclo_basico_concluido_em  date,
  atualizado_em              timestamptz not null default now()
);

create or replace function public.plano_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    if new.step1_aprovado or new.step2ck_aprovado or new.data_matricula is not null or new.ciclo_basico_concluido_em is not null then
      raise exception 'Aprovação, matrícula e ciclo básico são lançados pela equipe.' using errcode = '42501';
    end if;
  else
    if (new.user_id, new.step1_aprovado, new.step2ck_aprovado, new.data_matricula, new.ciclo_basico_concluido_em)
       is distinct from (old.user_id, old.step1_aprovado, old.step2ck_aprovado, old.data_matricula, old.ciclo_basico_concluido_em) then
      raise exception 'Aprovação, matrícula e ciclo básico são lançados pela equipe.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists plano_guard on public.plano_participante;
create trigger plano_guard
  before insert or update on public.plano_participante
  for each row execute function public.plano_guard();

-- ---------------------------------------------------------------------------
-- Metas e critérios de risco da coorte (uma linha só; o admin edita)
-- ---------------------------------------------------------------------------
create table if not exists public.plataforma_config (
  id             smallint primary key default 1 check (id = 1),
  dados          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);
insert into public.plataforma_config (id, dados) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS das tabelas da plataforma
-- ---------------------------------------------------------------------------
alter table public.simulados           enable row level security;
alter table public.nbme_autoavaliacoes enable row level security;
alter table public.presenca            enable row level security;
alter table public.plano_participante  enable row level security;
alter table public.plataforma_config   enable row level security;

revoke all on public.simulados, public.nbme_autoavaliacoes, public.presenca,
              public.plano_participante, public.plataforma_config from anon, authenticated;
grant select, insert, update, delete on public.simulados, public.nbme_autoavaliacoes, public.presenca,
                                        public.plano_participante to authenticated;
grant select, insert, update on public.plataforma_config to authenticated;

-- simulados: participante grava e lê os próprios; só o admin altera ou apaga
drop policy if exists simulados_select on public.simulados;
create policy simulados_select on public.simulados for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists simulados_insert on public.simulados;
create policy simulados_insert on public.simulados for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists simulados_update on public.simulados;
create policy simulados_update on public.simulados for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists simulados_delete on public.simulados;
create policy simulados_delete on public.simulados for delete to authenticated
  using ((select public.is_admin()));

-- autoavaliações: participante lança e corrige as próprias até a verificação
drop policy if exists nbme_select on public.nbme_autoavaliacoes;
create policy nbme_select on public.nbme_autoavaliacoes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists nbme_insert on public.nbme_autoavaliacoes;
create policy nbme_insert on public.nbme_autoavaliacoes for insert to authenticated
  with check ((user_id = (select auth.uid()) and not verificada) or (select public.is_admin()));
drop policy if exists nbme_update on public.nbme_autoavaliacoes;
create policy nbme_update on public.nbme_autoavaliacoes for update to authenticated
  using ((user_id = (select auth.uid()) and not verificada) or (select public.is_admin()))
  with check ((user_id = (select auth.uid()) and not verificada) or (select public.is_admin()));
drop policy if exists nbme_delete on public.nbme_autoavaliacoes;
create policy nbme_delete on public.nbme_autoavaliacoes for delete to authenticated
  using ((user_id = (select auth.uid()) and not verificada) or (select public.is_admin()));

-- presença: participante só lê a própria
drop policy if exists presenca_select on public.presenca;
create policy presenca_select on public.presenca for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists presenca_insert on public.presenca;
create policy presenca_insert on public.presenca for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists presenca_update on public.presenca;
create policy presenca_update on public.presenca for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists presenca_delete on public.presenca;
create policy presenca_delete on public.presenca for delete to authenticated
  using ((select public.is_admin()));

-- plano: participante lê e altera o próprio (o gatilho limita às datas de prova)
drop policy if exists plano_select on public.plano_participante;
create policy plano_select on public.plano_participante for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists plano_insert on public.plano_participante;
create policy plano_insert on public.plano_participante for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists plano_update on public.plano_participante;
create policy plano_update on public.plano_participante for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists plano_delete on public.plano_participante;
create policy plano_delete on public.plano_participante for delete to authenticated
  using ((select public.is_admin()));

-- metas: todos os logados leem (o participante vê os critérios); só o admin grava
drop policy if exists plataforma_config_select on public.plataforma_config;
create policy plataforma_config_select on public.plataforma_config for select to authenticated
  using (true);
drop policy if exists plataforma_config_insert on public.plataforma_config;
create policy plataforma_config_insert on public.plataforma_config for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists plataforma_config_update on public.plataforma_config;
create policy plataforma_config_update on public.plataforma_config for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Resumo por participante (mesma forma de resumirParticipante() em
-- plataforma/js/desempenho.js). Uso interno: só as funções abaixo chamam.
-- O dia de estudo vira às 4h no fuso p_tz, como no app.
-- ---------------------------------------------------------------------------
create or replace function public.r2a_resumo_interno(p_ids uuid[], p_tz text default 'America/Sao_Paulo', p_agora timestamptz default now())
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  par as (
    select ((p_agora at time zone p_tz) - interval '4 hours')::date as hoje
  ),
  ofc as (
    select count(*)::int as n from public.cards where baralho = 'oficial' and status = 'aprovado'
  ),
  rv as (
    select r.user_id, ((r.review at time zone p_tz) - interval '4 hours')::date as dia, r.state, r.rating, r.review
    from public.revlog r
    where r.user_id = any (p_ids)
  ),
  rv_agg as (
    select rv.user_id,
      count(*) filter (where rv.dia = par.hoje)::int as hoje,
      count(*) filter (where rv.dia between par.hoje - 6 and par.hoje)::int as d7,
      count(*) filter (where rv.dia between par.hoje - 29 and par.hoje)::int as d30,
      count(distinct rv.dia) filter (where rv.dia between par.hoje - 29 and par.hoje)::int as dias30,
      count(*) filter (where rv.state = 2 and rv.dia >= par.hoje - 29)::int as ret_total,
      count(*) filter (where rv.state = 2 and rv.rating > 1 and rv.dia >= par.hoje - 29)::int as ret_acertos,
      max(rv.review) as ultima
    from rv cross join par
    group by rv.user_id
  ),
  rv_dia as (
    select user_id, dia, count(*)::int as n from rv group by user_id, dia
  ),
  serie as (
    select u.id as user_id, jsonb_agg(coalesce(c.n, 0) order by g.i) as por_dia
    from unnest(p_ids) as u (id)
    cross join par
    cross join generate_series(0, 29) as g (i)
    left join rv_dia c on c.user_id = u.id and c.dia = par.hoje - 29 + g.i
    group by u.id
  ),
  ilhas as (
    select user_id, max(dia) as fim, count(*)::int as n
    from (
      select user_id, dia, dia - (row_number() over (partition by user_id order by dia))::int as grp
      from (select distinct user_id, dia from rv) d
    ) x
    group by user_id, grp
  ),
  seq as (
    select i.user_id,
      coalesce(max(i.n) filter (where i.fim between par.hoje - 1 and par.hoje), 0) as atual,
      max(i.n) as maior
    from ilhas i cross join par
    group by i.user_id
  ),
  est as (
    select s.user_id,
      count(distinct s.card_id) filter (where s.state > 0 and c.baralho = 'oficial' and c.status = 'aprovado')::int as vistos,
      count(*) filter (where s.state > 0)::int as vistos_itens,
      count(*) filter (where not s.suspenso and s.state = 2 and s.scheduled_days >= 21)::int as maduros,
      count(*) filter (where not s.suspenso and s.state = 2 and s.scheduled_days < 21)::int as jovens,
      count(*) filter (where not s.suspenso and s.state in (1, 3))::int as aprendendo,
      count(*) filter (where s.leech)::int as leeches,
      count(*) filter (where s.suspenso)::int as suspensos
    from public.srs_estado s
    left join public.cards c on c.id = s.card_id
    where s.user_id = any (p_ids)
    group by s.user_id
  ),
  sim_r as (
    select s.user_id, s.step, s.id, s.percentual, s.acertos, s.total, s.fim,
      row_number() over (partition by s.user_id, s.step order by s.fim desc) as rn
    from public.simulados s
    where s.user_id = any (p_ids)
  ),
  sim as (
    select user_id, step, count(*)::int as n, max(fim) as ultimo_em,
      coalesce(jsonb_agg(jsonb_build_object('id', id, 'percentual', percentual, 'acertos', acertos, 'total', total, 'fim', fim)
                         order by fim desc) filter (where rn <= 5), '[]'::jsonb) as ultimos
    from sim_r
    group by user_id, step
  ),
  sim_j as (
    select user_id,
      jsonb_object_agg(step, jsonb_build_object('n', n, 'ultimo_em', ultimo_em, 'ultimos', ultimos)) as j,
      max(ultimo_em) as ultimo
    from sim
    group by user_id
  ),
  nb as (
    select user_id,
      jsonb_agg(jsonb_build_object(
        'id', id, 'step', step, 'formulario', formulario, 'modo', modo, 'data', data, 'escore', escore,
        'escore_texto', escore_texto, 'probabilidade', probabilidade,
        'faixa_acima_aprovacao_baixa', faixa_acima_aprovacao_baixa, 'verificada', verificada, 'criado_em', criado_em)
        order by data, criado_em) as j,
      max(data) as ultima_data
    from public.nbme_autoavaliacoes
    where user_id = any (p_ids)
    group by user_id
  )
  select jsonb_build_object(
    'user_id', p.id,
    'nome', p.nome,
    'email', p.email,
    'criado_em', p.criado_em,
    'sintetico', false,
    'plano', jsonb_build_object(
      'data_prova_step1', coalesce(pl.data_prova_step1,
        case when cfg.dados ->> 'dataProva' ~ '^\d{4}-\d{2}-\d{2}$' then (cfg.dados ->> 'dataProva')::date end),
      'data_prova_step2ck', pl.data_prova_step2ck,
      'step1_aprovado', coalesce(pl.step1_aprovado, false),
      'step2ck_aprovado', coalesce(pl.step2ck_aprovado, false),
      'data_matricula', pl.data_matricula,
      'ciclo_basico_concluido_em', pl.ciclo_basico_concluido_em),
    'flashcards', jsonb_build_object(
      'revisoes_hoje', coalesce(ra.hoje, 0),
      'revisoes_7d', coalesce(ra.d7, 0),
      'revisoes_30d', coalesce(ra.d30, 0),
      'dias_estudados_30d', coalesce(ra.dias30, 0),
      'por_dia_30', se.por_dia,
      'retencao_30d', jsonb_build_object(
        'total', coalesce(ra.ret_total, 0),
        'acertos', coalesce(ra.ret_acertos, 0),
        'taxa', case when coalesce(ra.ret_total, 0) > 0 then round(ra.ret_acertos::numeric / ra.ret_total, 6) end),
      'sequencia_atual', coalesce(sq.atual, 0),
      'maior_sequencia', coalesce(sq.maior, 0),
      'vistos', coalesce(es.vistos, 0),
      'vistos_itens', coalesce(es.vistos_itens, 0),
      'maduros', coalesce(es.maduros, 0),
      'jovens', coalesce(es.jovens, 0),
      'aprendendo', coalesce(es.aprendendo, 0),
      'leeches', coalesce(es.leeches, 0),
      'suspensos', coalesce(es.suspensos, 0),
      'total_oficial', ofc.n,
      'cobertura', case when ofc.n > 0 then round(coalesce(es.vistos, 0)::numeric / ofc.n, 6) end,
      'ultima_revisao', ra.ultima),
    'simulados', jsonb_build_object(
      'step1', coalesce(sj.j -> 'step1', '{"n": 0, "ultimo_em": null, "ultimos": []}'::jsonb),
      'step2ck', coalesce(sj.j -> 'step2ck', '{"n": 0, "ultimo_em": null, "ultimos": []}'::jsonb)),
    'nbme', coalesce(nb.j, '[]'::jsonb),
    'presenca', case when pr.user_id is null then null else jsonb_build_object(
      'aulas_assistidas', pr.aulas_assistidas,
      'aulas_totais', pr.aulas_totais,
      'percentual', case when pr.aulas_totais > 0 then round(pr.aulas_assistidas::numeric / pr.aulas_totais, 6) end,
      'atualizado_em', pr.atualizado_em) end,
    'ultima_atividade', greatest(ra.ultima, sj.ultimo, (nb.ultima_data + time '12:00') at time zone p_tz)
  )
  from public.profiles p
  cross join ofc
  left join rv_agg ra on ra.user_id = p.id
  left join serie se on se.user_id = p.id
  left join seq sq on sq.user_id = p.id
  left join est es on es.user_id = p.id
  left join sim_j sj on sj.user_id = p.id
  left join nb on nb.user_id = p.id
  left join public.presenca pr on pr.user_id = p.id
  left join public.plano_participante pl on pl.user_id = p.id
  left join public.configuracoes cfg on cfg.user_id = p.id
  where p.id = any (p_ids)
  order by p.nome, p.id;
$$;

-- Ninguém chama a função interna diretamente pela API
revoke all on function public.r2a_resumo_interno(uuid[], text, timestamptz) from public, anon, authenticated;

-- Painel do admin: uma linha (jsonb) por participante
create or replace function public.r2a_admin_resumo_participantes(p_tz text default 'America/Sao_Paulo', p_agora timestamptz default now())
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores veem o painel de rendimento.' using errcode = '42501';
  end if;
  return query
    select * from public.r2a_resumo_interno(
      array(select id from public.profiles where papel = 'participante'), p_tz, p_agora);
end;
$$;

-- Painel do participante: o próprio resumo
create or replace function public.r2a_meu_resumo(p_tz text default 'America/Sao_Paulo', p_agora timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'Entre com seu e-mail para continuar.' using errcode = '42501';
  end if;
  select r into v from public.r2a_resumo_interno(array[auth.uid()], p_tz, p_agora) as r;
  return v;
end;
$$;

-- Revisões por dia de um participante (heatmap e tendência de retenção).
-- security invoker: a RLS do revlog já limita ao próprio usuário ou ao admin.
create or replace function public.r2a_atividade_diaria(p_user uuid, p_dias integer default 182, p_tz text default 'America/Sao_Paulo', p_agora timestamptz default now())
returns table (dia date, revisoes integer, revisao_total integer, revisao_acertos integer)
language sql
stable
security invoker
set search_path = public
as $$
  with par as (
    select ((p_agora at time zone p_tz) - interval '4 hours')::date as hoje, least(greatest(coalesce(p_dias, 182), 1), 730) as n
  ),
  rv as (
    select ((r.review at time zone p_tz) - interval '4 hours')::date as d, r.state, r.rating
    from public.revlog r
    where r.user_id = p_user
      and r.review >= p_agora - make_interval(days => (select n from par) + 2)
  )
  select (par.hoje - par.n + 1 + g.i)::date as dia,
    count(rv.d)::int,
    count(rv.d) filter (where rv.state = 2)::int,
    count(rv.d) filter (where rv.state = 2 and rv.rating > 1)::int
  from par
  cross join lateral generate_series(0, par.n - 1) as g (i)
  left join rv on rv.d = par.hoje - par.n + 1 + g.i
  group by g.i, par.hoje, par.n
  order by g.i;
$$;

-- Importação de presença por CSV já lido no navegador: [{email, aulas_assistidas, aulas_totais}]
create or replace function public.r2a_admin_importar_presenca(p_linhas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_a integer;
  v_t integer;
  v_ok integer := 0;
  v_nao jsonb := '[]'::jsonb;
  v_err jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores importam presença.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'Envie uma lista de linhas.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_linhas) loop
    begin
      v_a := (v_item ->> 'aulas_assistidas')::integer;
      v_t := (v_item ->> 'aulas_totais')::integer;
    exception when others then
      v_err := v_err || jsonb_build_object('email', v_item ->> 'email', 'motivo', 'Números inválidos.');
      continue;
    end;
    if v_a is null or v_t is null or v_a < 0 or v_t < 0 or v_a > v_t then
      v_err := v_err || jsonb_build_object('email', v_item ->> 'email', 'motivo', 'Números inválidos.');
      continue;
    end if;
    select p.id into v_id from public.profiles p where lower(p.email) = lower(btrim(v_item ->> 'email')) limit 1;
    if v_id is null then
      v_nao := v_nao || to_jsonb(lower(btrim(v_item ->> 'email')));
      continue;
    end if;
    insert into public.presenca (user_id, aulas_assistidas, aulas_totais, origem)
    values (v_id, v_a, v_t, 'csv')
    on conflict (user_id) do update
      set aulas_assistidas = excluded.aulas_assistidas, aulas_totais = excluded.aulas_totais, origem = 'csv';
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('atualizados', v_ok, 'nao_encontrados', v_nao, 'erros', v_err);
end;
$$;

revoke all on function public.r2a_admin_resumo_participantes(text, timestamptz) from public, anon;
revoke all on function public.r2a_meu_resumo(text, timestamptz) from public, anon;
revoke all on function public.r2a_atividade_diaria(uuid, integer, text, timestamptz) from public, anon;
revoke all on function public.r2a_admin_importar_presenca(jsonb) from public, anon;
grant execute on function public.r2a_admin_resumo_participantes(text, timestamptz) to authenticated;
grant execute on function public.r2a_meu_resumo(text, timestamptz) to authenticated;
grant execute on function public.r2a_atividade_diaria(uuid, integer, text, timestamptz) to authenticated;
grant execute on function public.r2a_admin_importar_presenca(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- ÁREA ADMINISTRATIVA (admin/): anotações do mentor sobre cada participante.
-- Texto interno da equipe, um por participante; o participante não lê nem grava.
-- Interface JavaScript: getAnotacao(userId) e saveAnotacao(userId, texto).
-- ---------------------------------------------------------------------------
create table if not exists public.anotacoes_mentor (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  texto           text not null default '' check (char_length(texto) <= 5000),
  atualizado_por  uuid references auth.users (id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

create or replace function public.anotacoes_mentor_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists anotacoes_mentor_guard on public.anotacoes_mentor;
create trigger anotacoes_mentor_guard
  before insert or update on public.anotacoes_mentor
  for each row execute function public.anotacoes_mentor_guard();

alter table public.anotacoes_mentor enable row level security;
revoke all on public.anotacoes_mentor from anon, authenticated;
grant select, insert, update, delete on public.anotacoes_mentor to authenticated;

drop policy if exists anotacoes_mentor_admin on public.anotacoes_mentor;
create policy anotacoes_mentor_admin on public.anotacoes_mentor for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- =============================================================================
-- BANCO DE QUESTÕES: questões (Step 1 e Step 2 CK), respostas por item,
-- simulados completos (14 ou 16 blocos de 30 minutos, com retomada), anotações
-- do aluno por item, reportes de erro, resultados oficiais e funções de análise
-- de itens. Interface JavaScript: plataforma/INTERFACE.md; método psicométrico:
-- plataforma/PSICOMETRIA.md; importação: tools/importar-banco.mjs.
--
-- Regras:
--   questoes            leitura só para logados com matrícula ativa (ou admin), e
--                       só itens com status 'ativo'; escrita só do admin (ou da
--                       chave service_role usada na importação, que ignora a RLS).
--   respostas_item      o aluno insere e lê as próprias; não altera nem apaga.
--                       Quando o item está em questoes, o gabarito, o Step e a
--                       versão vêm do banco (o aluno não forja o acerto).
--   simulados_completos o aluno cria, lê e atualiza o próprio enquanto estiver em
--                       andamento; bloco encerrado não reabre; formulário imutável.
--   anotacoes_item      só o próprio aluno lê e grava (nem o admin lê).
--   reportes_item       o aluno cria e lê os próprios (sempre 'aberto'); o admin
--                       trata a fila.
--   resultados_oficiais o admin lança; o aluno lê os próprios.
-- =============================================================================

-- O usuário atual pode ler o banco? (admin, ou participante com matrícula ativa)
create or replace function public.pode_ler_banco()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.papel = 'admin' or (p.papel = 'participante' and p.ativo))
  );
$$;
revoke all on function public.pode_ler_banco() from public, anon;
grant execute on function public.pode_ler_banco() to authenticated;

-- ---------------------------------------------------------------------------
-- Questões: o item inteiro fica em "dados" (contrato de plataforma/CONTRATO-ITEM.md);
-- as colunas de classificação, o gabarito e o Angoff são derivados pelo gatilho.
-- ---------------------------------------------------------------------------
create table if not exists public.questoes (
  id              text primary key check (id ~ '^[A-Za-z0-9._-]{1,40}$'),
  step            text not null check (step in ('step1', 'step2ck')),
  versao          integer not null default 1 check (versao >= 1),
  status          text not null default 'ativo' check (status in ('ativo', 'rascunho', 'suspenso', 'aposentado')),
  dados           jsonb not null,
  correta         text not null check (correta ~ '^[A-J]$'),
  sistema         text,
  disciplina      text,
  area            text,
  tarefa          text,
  competencia     text,
  dificuldade     text check (dificuldade in ('facil', 'media', 'dificil')),
  angoff          numeric(6,4) not null check (angoff > 0 and angoff < 1),
  b_calibrado     numeric(8,4) check (b_calibrado between -10 and 10),
  ep_calibrado    numeric(8,4),
  n_calibracao    integer,
  calibrado_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references auth.users (id) on delete set null
);
create index if not exists questoes_step_status_idx on public.questoes (step, status, sistema);

create or replace function public.questoes_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_letras text[];
  v_ang numeric;
  v_ver integer;
begin
  if jsonb_typeof(new.dados) is distinct from 'object' then
    raise exception 'O item precisa ser um objeto JSON.' using errcode = '22023';
  end if;
  new.dados := new.dados || jsonb_build_object('id', new.id);
  new.step := coalesce(nullif(new.dados ->> 'step', ''), new.step);
  new.correta := upper(btrim(coalesce(new.dados ->> 'correta', '')));
  select array_agg(upper(a ->> 'letra')) into v_letras
  from jsonb_array_elements(case when jsonb_typeof(new.dados -> 'alternativas') = 'array' then new.dados -> 'alternativas' else '[]'::jsonb end) a;
  if v_letras is null or array_length(v_letras, 1) not between 5 and 8 then
    raise exception 'O item precisa ter de 5 a 8 alternativas.' using errcode = '22023';
  end if;
  if not (new.correta = any (v_letras)) then
    raise exception 'A resposta correta não está entre as alternativas.' using errcode = '22023';
  end if;
  new.sistema := nullif(new.dados ->> 'sistema', '');
  new.disciplina := nullif(new.dados ->> 'disciplina', '');
  new.area := nullif(new.dados ->> 'area', '');
  new.tarefa := nullif(new.dados ->> 'tarefa', '');
  new.competencia := nullif(new.dados ->> 'competencia', '');
  new.dificuldade := case when new.dados ->> 'dificuldade' in ('facil', 'media', 'dificil') then new.dados ->> 'dificuldade' end;
  v_ang := case when (new.dados ->> 'angoff') ~ '^0?\.[0-9]+$' then (new.dados ->> 'angoff')::numeric end;
  if v_ang is null or v_ang <= 0 or v_ang >= 1 then
    v_ang := case new.dificuldade when 'facil' then 0.80 when 'dificil' then 0.45 else 0.65 end;
  end if;
  new.angoff := v_ang;
  v_ver := case when (new.dados ->> 'versao') ~ '^[0-9]{1,6}$' then (new.dados ->> 'versao')::integer else 1 end;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.versao := greatest(coalesce(new.versao, 1), v_ver);
  else
    new.criado_em := old.criado_em;
    if (new.dados - 'versao' - 'id') is distinct from (old.dados - 'versao' - 'id') then
      -- conteúdo novo: versão sobe e a calibração antiga deixa de valer
      new.versao := greatest(v_ver, old.versao + 1);
      new.b_calibrado := null; new.ep_calibrado := null; new.n_calibracao := null; new.calibrado_em := null;
    else
      new.versao := old.versao;
    end if;
  end if;
  new.dados := new.dados || jsonb_build_object('versao', new.versao);
  return new;
end;
$$;

drop trigger if exists questoes_guard on public.questoes;
create trigger questoes_guard
  before insert or update on public.questoes
  for each row execute function public.questoes_guard();

-- ---------------------------------------------------------------------------
-- Respostas por item (banco, simulado completo e bloco de 30 minutos)
-- ---------------------------------------------------------------------------
create table if not exists public.respostas_item (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  questao_id     text not null check (questao_id ~ '^[A-Za-z0-9._-]{1,40}$'),
  step           text not null check (step in ('step1', 'step2ck')),
  resposta       text check (resposta ~ '^[A-J]$'),
  correta        boolean not null default false,
  tempo_ms       integer not null default 0 check (tempo_ms between 0 and 86400000),
  marcada        boolean not null default false,
  modo           text not null check (modo in ('tutor', 'cronometrado')),
  origem         text not null check (origem in ('banco', 'simulado', 'bloco_30')),
  sessao_id      text check (length(sessao_id) <= 64),
  bloco          smallint check (bloco between 0 and 40),
  posicao        smallint check (posicao between 0 and 40),
  versao_item    integer,
  respondida_em  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists respostas_item_user_idx on public.respostas_item (user_id, step, respondida_em);
create index if not exists respostas_item_questao_idx on public.respostas_item (questao_id);

-- security definer para consultar o gabarito mesmo quando o aluno não lê questoes
create or replace function public.respostas_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step text;
  v_correta text;
  v_versao integer;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin() then
      new.user_id := auth.uid();
    end if;
    new.criado_em := now();
    if new.respondida_em > now() + interval '5 minutes' then
      raise exception 'A data da resposta não pode estar no futuro.' using errcode = '22023';
    end if;
    select q.step, q.correta, q.versao into v_step, v_correta, v_versao from public.questoes q where q.id = new.questao_id;
    if found then
      new.step := v_step;
      new.correta := new.resposta is not null and new.resposta = v_correta;
      new.versao_item := v_versao;
    end if;
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists respostas_item_guard on public.respostas_item;
create trigger respostas_item_guard
  before insert or update on public.respostas_item
  for each row execute function public.respostas_item_guard();

-- ---------------------------------------------------------------------------
-- Simulados completos (formulário fixo ou personalizado, com retomada)
-- formulario: { id, codigo, step, tipo, modo, semente, blocos: [[ids]], tempo, ... }
-- sessao:     estado do relógio e respostas (plataforma/js/formularios.js)
-- ---------------------------------------------------------------------------
create table if not exists public.simulados_completos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step           text not null check (step in ('step1', 'step2ck')),
  tipo           text not null check (tipo in ('completo', 'meio', 'prontidao')),
  montagem       text not null default 'fixo' check (montagem in ('fixo', 'personalizado')),
  formulario_id  text not null check (length(formulario_id) between 1 and 120),
  nome           text not null default '' check (length(nome) <= 120),
  reduzido       boolean not null default false,
  formulario     jsonb not null,
  sessao         jsonb not null,
  estado         text not null default 'em_andamento' check (estado in ('em_andamento', 'concluido', 'abandonado')),
  bloco_atual    smallint not null default 0,
  resultado      jsonb,
  inicio         timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  fim            timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists simulados_completos_user_idx on public.simulados_completos (user_id, step, atualizado_em desc);

create or replace function public.simulados_completos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_part boolean := auth.uid() is not null and not public.is_admin();
  v_nb integer;
  i integer;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.criado_em := old.criado_em;
    new.inicio := old.inicio;
    if v_part then
      if old.estado <> 'em_andamento' then
        raise exception 'Simulado encerrado não pode ser alterado.' using errcode = '42501';
      end if;
      new.formulario := old.formulario;
      new.formulario_id := old.formulario_id;
      new.step := old.step;
      new.tipo := old.tipo;
      new.montagem := old.montagem;
      new.reduzido := old.reduzido;
      new.nome := old.nome;
    end if;
  end if;
  if jsonb_typeof(new.formulario -> 'blocos') is distinct from 'array' then
    raise exception 'O formulário precisa trazer a lista de blocos.' using errcode = '22023';
  end if;
  v_nb := jsonb_array_length(new.formulario -> 'blocos');
  if v_nb < 1 or v_nb > 16 then
    raise exception 'O formulário precisa ter de 1 a 16 blocos.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(new.formulario -> 'blocos') b
             where jsonb_typeof(b) <> 'array' or jsonb_array_length(b) not between 1 and 20) then
    raise exception 'Cada bloco precisa ter de 1 a 20 itens.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.sessao) is distinct from 'object' then
    raise exception 'O estado do simulado precisa ser um objeto JSON.' using errcode = '22023';
  end if;
  new.bloco_atual := case when (new.sessao ->> 'bloco_atual') ~ '^[0-9]{1,2}$' then (new.sessao ->> 'bloco_atual')::integer else 0 end;
  if new.bloco_atual > v_nb then
    raise exception 'Bloco atual inválido.' using errcode = '22023';
  end if;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.inicio := now();
    if v_part then
      new.user_id := auth.uid();
      new.estado := 'em_andamento';
      new.resultado := null;
      new.fim := null;
    end if;
    return new;
  end if;
  if v_part then
    if new.bloco_atual < old.bloco_atual then
      raise exception 'Um bloco encerrado não reabre.' using errcode = '42501';
    end if;
    for i in 0 .. old.bloco_atual - 1 loop
      if (new.sessao -> 'respostas' -> i) is distinct from (old.sessao -> 'respostas' -> i) then
        raise exception 'As respostas de um bloco encerrado não podem mudar.' using errcode = '42501';
      end if;
    end loop;
  end if;
  if new.estado <> 'em_andamento' and old.estado = 'em_andamento' then
    new.fim := now();
  end if;
  return new;
end;
$$;

drop trigger if exists simulados_completos_guard on public.simulados_completos;
create trigger simulados_completos_guard
  before insert or update on public.simulados_completos
  for each row execute function public.simulados_completos_guard();

-- ---------------------------------------------------------------------------
-- Anotações do aluno por item (privadas)
-- ---------------------------------------------------------------------------
create table if not exists public.anotacoes_item (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  questao_id     text not null check (questao_id ~ '^[A-Za-z0-9._-]{1,40}$'),
  texto          text not null default '' check (char_length(texto) <= 5000),
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, questao_id)
);

create or replace function public.anotacoes_item_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
  else
    new.user_id := old.user_id;
    new.questao_id := old.questao_id;
  end if;
  return new;
end;
$$;

drop trigger if exists anotacoes_item_guard on public.anotacoes_item;
create trigger anotacoes_item_guard
  before insert or update on public.anotacoes_item
  for each row execute function public.anotacoes_item_guard();

-- ---------------------------------------------------------------------------
-- Reportes de erro em item (fila do admin)
-- ---------------------------------------------------------------------------
create table if not exists public.reportes_item (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  autor_nome     text not null default '' check (length(autor_nome) <= 120),
  questao_id     text not null check (questao_id ~ '^[A-Za-z0-9._-]{1,40}$'),
  versao_item    integer,
  motivo         text not null check (motivo in ('gabarito', 'mais_de_uma_correta', 'desatualizado', 'erro_texto', 'valores_lab', 'explicacao', 'outro')),
  texto          text not null default '' check (char_length(texto) <= 2000),
  status         text not null default 'aberto' check (status in ('aberto', 'em_analise', 'resolvido', 'rejeitado')),
  resposta       text not null default '' check (char_length(resposta) <= 2000),
  resolvido_por  uuid references auth.users (id) on delete set null,
  resolvido_em   timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists reportes_item_status_idx on public.reportes_item (status, criado_em desc);

create or replace function public.reportes_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part boolean := auth.uid() is not null and not public.is_admin();
  v_nome text;
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    if v_part then
      new.user_id := auth.uid();
      new.status := 'aberto';
      new.resposta := '';
      new.resolvido_por := null;
      new.resolvido_em := null;
      select p.nome into v_nome from public.profiles p where p.id = auth.uid();
      new.autor_nome := left(coalesce(nullif(v_nome, ''), new.autor_nome, ''), 120);
    end if;
    select q.versao into new.versao_item from public.questoes q where q.id = new.questao_id;
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.autor_nome := old.autor_nome;
  new.questao_id := old.questao_id;
  new.versao_item := old.versao_item;
  new.motivo := old.motivo;
  new.texto := old.texto;
  new.criado_em := old.criado_em;
  if new.status in ('resolvido', 'rejeitado') then
    if new.status is distinct from old.status then
      new.resolvido_por := coalesce(auth.uid(), new.resolvido_por);
      new.resolvido_em := now();
    else
      new.resolvido_por := old.resolvido_por;
      new.resolvido_em := old.resolvido_em;
    end if;
  else
    new.resolvido_por := null;
    new.resolvido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reportes_item_guard on public.reportes_item;
create trigger reportes_item_guard
  before insert or update on public.reportes_item
  for each row execute function public.reportes_item_guard();

-- ---------------------------------------------------------------------------
-- Resultados oficiais (desfechos usados na calibração: Pass/Fail e nota do CK)
-- ---------------------------------------------------------------------------
create table if not exists public.resultados_oficiais (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  step            text not null check (step in ('step1', 'step2ck')),
  data            date not null check (data >= date '2015-01-01'),
  resultado       text check (resultado in ('pass', 'fail')),
  escore          smallint check (escore between 1 and 999),
  observacao      text not null default '' check (char_length(observacao) <= 1000),
  registrado_por  uuid references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint resultados_oficiais_ck check (resultado is not null),
  constraint resultados_oficiais_step1_ck check (step <> 'step1' or escore is null)
);
create index if not exists resultados_oficiais_user_idx on public.resultados_oficiais (user_id, step, data);

create or replace function public.resultados_oficiais_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.registrado_por := coalesce(auth.uid(), new.registrado_por);
  else
    new.id := old.id;
    new.criado_em := old.criado_em;
    new.registrado_por := old.registrado_por;
  end if;
  if new.data > current_date + 2 then
    raise exception 'A data da prova não pode estar no futuro.' using errcode = '22023';
  end if;
  -- Step 2 CK a partir de 01/07/2025: padrão de 218 (usmle.org, Examination Results and Scoring)
  if new.resultado is null and new.step = 'step2ck' and new.escore is not null and new.data >= date '2025-07-01' then
    new.resultado := case when new.escore >= 218 then 'pass' else 'fail' end;
  end if;
  if new.step = 'step2ck' and new.escore is not null and new.data >= date '2025-07-01'
     and new.resultado is distinct from (case when new.escore >= 218 then 'pass' else 'fail' end) then
    raise exception 'A nota não combina com o resultado: desde 01/07/2025 o padrão de aprovação do Step 2 CK é 218.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists resultados_oficiais_guard on public.resultados_oficiais;
create trigger resultados_oficiais_guard
  before insert or update on public.resultados_oficiais
  for each row execute function public.resultados_oficiais_guard();

-- ---------------------------------------------------------------------------
-- Modelos psicométricos ajustados com desfechos reais (um por Step). Todos os
-- logados leem (a tela do aluno usa); só o admin grava. Sem linha, a tela diz
-- que a estimativa vem do padrão de Angoff.
-- ---------------------------------------------------------------------------
create table if not exists public.modelos_psicometricos (
  step            text primary key check (step in ('step1', 'step2ck')),
  dados           jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  atualizado_por  uuid references auth.users (id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

create or replace function public.modelos_psicometricos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists modelos_psicometricos_guard on public.modelos_psicometricos;
create trigger modelos_psicometricos_guard
  before insert or update on public.modelos_psicometricos
  for each row execute function public.modelos_psicometricos_guard();

-- ---------------------------------------------------------------------------
-- RLS do banco de questões
-- ---------------------------------------------------------------------------
alter table public.questoes            enable row level security;
alter table public.respostas_item      enable row level security;
alter table public.simulados_completos enable row level security;
alter table public.anotacoes_item      enable row level security;
alter table public.reportes_item       enable row level security;
alter table public.resultados_oficiais enable row level security;
alter table public.modelos_psicometricos enable row level security;

revoke all on public.questoes, public.respostas_item, public.simulados_completos, public.anotacoes_item,
              public.reportes_item, public.resultados_oficiais, public.modelos_psicometricos from anon, authenticated;
grant select, insert, update, delete on public.questoes, public.respostas_item, public.simulados_completos,
                                        public.anotacoes_item, public.reportes_item, public.resultados_oficiais,
                                        public.modelos_psicometricos to authenticated;

-- modelos psicométricos: todos os logados leem; só o admin grava
drop policy if exists modelos_psicometricos_select on public.modelos_psicometricos;
create policy modelos_psicometricos_select on public.modelos_psicometricos for select to authenticated
  using (true);
drop policy if exists modelos_psicometricos_escrita on public.modelos_psicometricos;
create policy modelos_psicometricos_escrita on public.modelos_psicometricos for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- questões: leitura de itens ativos para matrícula ativa; o admin lê e escreve tudo
drop policy if exists questoes_select on public.questoes;
create policy questoes_select on public.questoes for select to authenticated
  using ((status = 'ativo' and (select public.pode_ler_banco())) or (select public.is_admin()));
drop policy if exists questoes_insert on public.questoes;
create policy questoes_insert on public.questoes for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists questoes_update on public.questoes;
create policy questoes_update on public.questoes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists questoes_delete on public.questoes;
create policy questoes_delete on public.questoes for delete to authenticated
  using ((select public.is_admin()));

-- respostas: o aluno grava e lê as próprias; só o admin altera ou apaga
drop policy if exists respostas_item_select on public.respostas_item;
create policy respostas_item_select on public.respostas_item for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists respostas_item_insert on public.respostas_item;
create policy respostas_item_insert on public.respostas_item for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists respostas_item_update on public.respostas_item;
create policy respostas_item_update on public.respostas_item for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists respostas_item_delete on public.respostas_item;
create policy respostas_item_delete on public.respostas_item for delete to authenticated
  using ((select public.is_admin()));

-- simulados completos: o aluno cria, lê e atualiza o próprio (o gatilho trava o resto)
drop policy if exists simulados_completos_select on public.simulados_completos;
create policy simulados_completos_select on public.simulados_completos for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists simulados_completos_insert on public.simulados_completos;
create policy simulados_completos_insert on public.simulados_completos for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists simulados_completos_update on public.simulados_completos;
create policy simulados_completos_update on public.simulados_completos for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists simulados_completos_delete on public.simulados_completos;
create policy simulados_completos_delete on public.simulados_completos for delete to authenticated
  using ((select public.is_admin()));

-- anotações do aluno: só o dono
drop policy if exists anotacoes_item_dono on public.anotacoes_item;
create policy anotacoes_item_dono on public.anotacoes_item for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- reportes: o aluno cria e lê os próprios; o admin trata
drop policy if exists reportes_item_select on public.reportes_item;
create policy reportes_item_select on public.reportes_item for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists reportes_item_insert on public.reportes_item;
create policy reportes_item_insert on public.reportes_item for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists reportes_item_update on public.reportes_item;
create policy reportes_item_update on public.reportes_item for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists reportes_item_delete on public.reportes_item;
create policy reportes_item_delete on public.reportes_item for delete to authenticated
  using ((select public.is_admin()));

-- resultados oficiais: o admin lança; o aluno lê os próprios
drop policy if exists resultados_oficiais_select on public.resultados_oficiais;
create policy resultados_oficiais_select on public.resultados_oficiais for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists resultados_oficiais_insert on public.resultados_oficiais;
create policy resultados_oficiais_insert on public.resultados_oficiais for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists resultados_oficiais_update on public.resultados_oficiais;
create policy resultados_oficiais_update on public.resultados_oficiais for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists resultados_oficiais_delete on public.resultados_oficiais;
create policy resultados_oficiais_delete on public.resultados_oficiais for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Funções de análise de itens (só admin; security definer com search_path fixo).
-- Regra comum: a primeira resposta de cada pessoa em cada item (a repetição mede
-- memória do item); modo tutor fora, salvo p_incluir_tutor; só a versão atual
-- do item, salvo p_todas_versoes. Mesmas regras de LocalStore e de
-- plataforma/js/psicometria.js (supabase/teste-local/04-compara-itens.mjs confere).
-- ---------------------------------------------------------------------------

-- Matriz de respostas pseudonimizada (pessoa = 1, 2, 3... pela ordem do user_id)
create or replace function public.r2a_admin_respostas_calibracao(p_step text default null, p_incluir_tutor boolean default false, p_todas_versoes boolean default false)
returns table (pessoa integer, questao_id text, step text, resposta text, correta boolean, modo text, origem text, tempo_ms integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores leem as respostas da turma.' using errcode = '42501';
  end if;
  return query
    with base as (
      select r.user_id, r.questao_id, r.step, r.resposta, r.correta, r.modo, r.origem, r.tempo_ms,
             row_number() over (partition by r.user_id, r.questao_id order by r.respondida_em, r.id) as ordem
      from public.respostas_item r
      left join public.questoes q on q.id = r.questao_id
      where (p_step is null or r.step = p_step)
        and (p_todas_versoes or q.id is null or r.versao_item is null or r.versao_item = q.versao)
    ), prim as (
      select * from base b where b.ordem = 1 and (p_incluir_tutor or b.modo <> 'tutor')
    )
    select dense_rank() over (order by p.user_id::text collate "C")::integer, p.questao_id, p.step, p.resposta, p.correta, p.modo, p.origem, p.tempo_ms
    from prim p;
end;
$$;

-- Estatísticas clássicas por item: n, p, distribuição das alternativas, tempo
-- mediano, ponto-bisserial corrigida (correlação entre acertar o item e a
-- proporção de acertos da pessoa nos outros itens, para quem respondeu pelo
-- menos 2) e as alternativas dos grupos superior e inferior (27% de cada lado,
-- pela proporção nos outros itens, desempate pelo user_id).
create or replace function public.r2a_admin_estatisticas_itens(p_step text default null, p_incluir_tutor boolean default false, p_todas_versoes boolean default false)
returns table (questao_id text, step text, n integer, acertos integer, p numeric, em_branco integer, opcoes jsonb,
               tempo_mediano_ms integer, pbis numeric, n_superior integer, n_inferior integer, opcoes_superior jsonb, opcoes_inferior jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores veem as estatísticas dos itens.' using errcode = '42501';
  end if;
  return query
    with base as (
      select r.user_id, r.questao_id, r.step, r.resposta, r.correta, r.modo, r.tempo_ms,
             row_number() over (partition by r.user_id, r.questao_id order by r.respondida_em, r.id) as ordem
      from public.respostas_item r
      left join public.questoes q on q.id = r.questao_id
      where (p_step is null or r.step = p_step)
        and (p_todas_versoes or q.id is null or r.versao_item is null or r.versao_item = q.versao)
    ), prim as (
      select b.user_id, b.questao_id, b.step, b.resposta, b.correta, b.tempo_ms from base b
      where b.ordem = 1 and (p_incluir_tutor or b.modo <> 'tutor')
    ), pess as (
      select pr.user_id, count(*) as nj, sum(pr.correta::int) as sj from prim pr group by pr.user_id
    ), rr as (
      select pr.*, case when pe.nj >= 2 then (pe.sj - pr.correta::int)::float8 / (pe.nj - 1) end as resto
      from prim pr join pess pe on pe.user_id = pr.user_id
    ), rk as (
      select rr.*, row_number() over (partition by rr.questao_id order by rr.resto, rr.user_id::text collate "C") as pos,
             count(*) over (partition by rr.questao_id) as m
      from rr where rr.resto is not null
    ), gr as (
      select rk.questao_id, rk.resposta,
             case when rk.m >= 4 and rk.pos <= greatest(1, floor(0.27 * rk.m)) then 'inf'
                  when rk.m >= 4 and rk.pos > rk.m - greatest(1, floor(0.27 * rk.m)) then 'sup' end as grupo
      from rk
    ), agg as (
      select pr.questao_id, min(pr.step) as step, count(*)::int as n, sum(pr.correta::int)::int as acertos,
             count(*) filter (where pr.resposta is null)::int as em_branco,
             round(percentile_cont(0.5) within group (order by pr.tempo_ms))::int as tempo_mediano_ms
      from prim pr group by pr.questao_id
    )
    select a.questao_id, a.step, a.n, a.acertos, round(a.acertos::numeric / a.n, 6), a.em_branco,
      coalesce((select jsonb_object_agg(x.resposta, x.c) from (select pr.resposta, count(*)::int as c from prim pr where pr.questao_id = a.questao_id and pr.resposta is not null group by pr.resposta) x), '{}'::jsonb),
      a.tempo_mediano_ms,
      (select round(corr(rr.correta::int::float8, rr.resto)::numeric, 6) from rr where rr.questao_id = a.questao_id and rr.resto is not null),
      (select count(*)::int from gr where gr.questao_id = a.questao_id and gr.grupo = 'sup'),
      (select count(*)::int from gr where gr.questao_id = a.questao_id and gr.grupo = 'inf'),
      coalesce((select jsonb_object_agg(x.resposta, x.c) from (select gr.resposta, count(*)::int as c from gr where gr.questao_id = a.questao_id and gr.grupo = 'sup' and gr.resposta is not null group by gr.resposta) x), '{}'::jsonb),
      coalesce((select jsonb_object_agg(x.resposta, x.c) from (select gr.resposta, count(*)::int as c from gr where gr.questao_id = a.questao_id and gr.grupo = 'inf' and gr.resposta is not null group by gr.resposta) x), '{}'::jsonb)
    from agg a;
end;
$$;

-- Grava a recalibração feita no navegador do admin: [{ id, b, ep, n }] (b nulo apaga)
create or replace function public.r2a_admin_salvar_calibracao(p_itens jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores gravam a calibração.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Envie uma lista de itens.' using errcode = '22023';
  end if;
  update public.questoes q set
    b_calibrado = (x ->> 'b')::numeric,
    ep_calibrado = (x ->> 'ep')::numeric,
    n_calibracao = case when x ->> 'b' is null then null else (x ->> 'n')::integer end,
    calibrado_em = case when x ->> 'b' is null then null else now() end
  from jsonb_array_elements(p_itens) x
  where q.id = x ->> 'id';
  get diagnostics v = row_count;
  return v;
end;
$$;

revoke all on function public.r2a_admin_respostas_calibracao(text, boolean, boolean) from public, anon;
revoke all on function public.r2a_admin_estatisticas_itens(text, boolean, boolean) from public, anon;
revoke all on function public.r2a_admin_salvar_calibracao(jsonb) from public, anon;
grant execute on function public.r2a_admin_respostas_calibracao(text, boolean, boolean) to authenticated;
grant execute on function public.r2a_admin_estatisticas_itens(text, boolean, boolean) to authenticated;
grant execute on function public.r2a_admin_salvar_calibracao(jsonb) to authenticated;

-- =============================================================================
-- REVISÃO DE ITENS PELO ADMIN (acréscimo de 29/10/2026): marca de revisão,
-- correção de gabarito com registro de versão e histórico de cada questão.
-- Interface: plataforma/INTERFACE.md, seção "Análise de itens na área
-- administrativa"; telas em admin/ (#/itens e #/item/<id>).
--   questoes.em_revisao    item marcado para revisão; continua no banco até a
--                          equipe decidir (retirar = status 'suspenso').
--   questoes_historico     uma linha por mudança de gabarito, de conteúdo, de
--                          status ou de marca de revisão, com versão, valor antes e
--                          depois, motivo e quem fez. Só o admin lê; ninguém
--                          escreve direto (o gatilho grava).
-- O motivo chega ao gatilho pela configuração local da transação 'r2a.motivo',
-- preenchida pelas funções r2a_admin_* abaixo.
-- =============================================================================
alter table public.questoes add column if not exists em_revisao boolean not null default false;
alter table public.questoes add column if not exists revisao_nota text not null default '';
do $$
begin
  alter table public.questoes add constraint questoes_revisao_nota_tamanho check (length(revisao_nota) <= 1000);
exception when duplicate_object then null;
end;
$$;

create table if not exists public.questoes_historico (
  id            bigint generated always as identity primary key,
  questao_id    text not null references public.questoes (id) on delete cascade,
  versao        integer not null,
  acao          text not null check (acao in ('gabarito', 'conteudo', 'status', 'revisao')),
  de            text,
  para          text,
  motivo        text not null default '' check (length(motivo) <= 1000),
  recorrigidas  integer,
  editor_id     uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists questoes_historico_questao_idx on public.questoes_historico (questao_id, criado_em);

create or replace function public.questoes_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := left(coalesce(current_setting('r2a.motivo', true), ''), 1000);
begin
  if new.correta is distinct from old.correta then
    insert into public.questoes_historico (questao_id, versao, acao, de, para, motivo, editor_id)
    values (new.id, new.versao, 'gabarito', old.correta, new.correta, v_motivo, auth.uid());
  elsif new.versao <> old.versao then
    insert into public.questoes_historico (questao_id, versao, acao, de, para, motivo, editor_id)
    values (new.id, new.versao, 'conteudo', old.versao::text, new.versao::text, v_motivo, auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into public.questoes_historico (questao_id, versao, acao, de, para, motivo, editor_id)
    values (new.id, new.versao, 'status', old.status, new.status, v_motivo, auth.uid());
  end if;
  if new.em_revisao is distinct from old.em_revisao or new.revisao_nota is distinct from old.revisao_nota then
    insert into public.questoes_historico (questao_id, versao, acao, de, para, motivo, editor_id)
    values (new.id, new.versao, 'revisao', case when old.em_revisao then 'sim' else 'nao' end,
            case when new.em_revisao then 'sim' else 'nao' end, coalesce(nullif(v_motivo, ''), left(new.revisao_nota, 1000)), auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists questoes_historico on public.questoes;
create trigger questoes_historico
  after update on public.questoes
  for each row execute function public.questoes_registrar_historico();

alter table public.questoes_historico enable row level security;
revoke all on public.questoes_historico from anon, authenticated;
grant select on public.questoes_historico to authenticated;
drop policy if exists questoes_historico_select on public.questoes_historico;
create policy questoes_historico_select on public.questoes_historico for select to authenticated
  using ((select public.is_admin()));

-- Corrige o gabarito: a versão sobe e a calibração do item é apagada (questoes_guard);
-- com p_recorrigir, as respostas já gravadas passam a valer pela alternativa nova e
-- ficam na versão nova (entram nas estatísticas do item e na estimativa dos alunos).
create or replace function public.r2a_admin_editar_gabarito(p_id text, p_correta text, p_motivo text, p_recorrigir boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_antiga text;
  v_letra text := upper(btrim(coalesce(p_correta, '')));
  v_versao integer;
  v_versao_antiga integer;
  v_n integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores editam o gabarito.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 or length(p_motivo) > 1000 then
    raise exception 'Explique o motivo da mudança (de 5 a 1000 caracteres).' using errcode = '22023';
  end if;
  select q.correta, q.versao into v_antiga, v_versao_antiga from public.questoes q where q.id = p_id for update;
  if not found then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  if v_letra = v_antiga then
    raise exception 'A alternativa escolhida já é o gabarito.' using errcode = '22023';
  end if;
  perform set_config('r2a.motivo', btrim(p_motivo), true);
  update public.questoes q set dados = jsonb_set(q.dados, '{correta}', to_jsonb(v_letra))
  where q.id = p_id
  returning q.versao into v_versao;
  if p_recorrigir then
    -- só as respostas da versão em vigor (mesmo conteúdo); as de uma versão de
    -- conteúdo anterior continuam fora dos índices
    update public.respostas_item r set correta = (r.resposta is not null and r.resposta = v_letra), versao_item = v_versao
    where r.questao_id = p_id and (r.versao_item is null or r.versao_item = v_versao_antiga);
    get diagnostics v_n = row_count;
    update public.questoes_historico h set recorrigidas = v_n
    where h.id = (select max(h2.id) from public.questoes_historico h2 where h2.questao_id = p_id and h2.acao = 'gabarito');
  end if;
  perform set_config('r2a.motivo', '', true);
  return jsonb_build_object('id', p_id, 'versao', v_versao, 'de', v_antiga, 'para', v_letra, 'recorrigidas', v_n);
end;
$$;

-- Marca ou desmarca o item para revisão (a nota vai para o histórico)
create or replace function public.r2a_admin_marcar_revisao(p_id text, p_revisao boolean, p_nota text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores marcam itens para revisão.' using errcode = '42501';
  end if;
  if length(coalesce(p_nota, '')) > 1000 then
    raise exception 'A nota tem no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  perform set_config('r2a.motivo', btrim(coalesce(p_nota, '')), true);
  update public.questoes q set em_revisao = coalesce(p_revisao, false),
    revisao_nota = case when coalesce(p_revisao, false) then btrim(coalesce(p_nota, '')) else '' end
  where q.id = p_id
  returning jsonb_build_object('id', q.id, 'em_revisao', q.em_revisao, 'revisao_nota', q.revisao_nota) into v;
  perform set_config('r2a.motivo', '', true);
  return v;
end;
$$;

-- Muda o status (retirar do banco = 'suspenso' ou 'aposentado'), com o motivo no histórico
create or replace function public.r2a_admin_status_questao(p_id text, p_status text, p_motivo text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores mudam o status de uma questão.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('ativo', 'rascunho', 'suspenso', 'aposentado') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  if length(coalesce(p_motivo, '')) > 1000 then
    raise exception 'O motivo tem no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  perform set_config('r2a.motivo', btrim(coalesce(p_motivo, '')), true);
  update public.questoes q set status = p_status where q.id = p_id
  returning jsonb_build_object('id', q.id, 'status', q.status) into v;
  perform set_config('r2a.motivo', '', true);
  return v;
end;
$$;

revoke all on function public.questoes_registrar_historico() from public, anon, authenticated;
revoke all on function public.r2a_admin_editar_gabarito(text, text, text, boolean) from public, anon;
revoke all on function public.r2a_admin_marcar_revisao(text, boolean, text) from public, anon;
revoke all on function public.r2a_admin_status_questao(text, text, text) from public, anon;
grant execute on function public.r2a_admin_editar_gabarito(text, text, text, boolean) to authenticated;
grant execute on function public.r2a_admin_marcar_revisao(text, boolean, text) to authenticated;
grant execute on function public.r2a_admin_status_questao(text, text, text) to authenticated;
