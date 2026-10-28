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
    return new;
  end if;
  if new.papel is distinct from old.papel then
    raise exception 'Somente administradores podem alterar o papel de um usuário.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil não pode mudar.' using errcode = '42501';
  end if;
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
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.atualizado_em := now();
    new.versao := 1;
    if v_uid is null or v_admin then
      new.autor_id := coalesce(new.autor_id, v_uid);
      return new;
    end if;
    -- participante
    new.autor_id := v_uid;
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
revoke all on public.profiles, public.cards, public.card_historico, public.srs_estado,
              public.revlog, public.sinalizacoes, public.configuracoes from anon;
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
