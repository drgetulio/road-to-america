-- Teste das políticas RLS e dos gatilhos com três usuários (admin, Ana e Bia).
-- Cada bloco "deve falhar" precisa terminar em ERROR ou em 0 linhas afetadas.
-- O id de card criado por participante é gerado pelo banco; por isso os ids
-- são capturados com \gset.
\set ON_ERROR_STOP 0
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.com','{}'),
 ('00000000-0000-0000-0000-00000000000b','ana@x.com','{"nome":"Ana"}'),
 ('00000000-0000-0000-0000-00000000000c','bia@x.com','{"nome":"Bia"}');
select id, email, nome, papel from public.profiles order by email;
-- promoção do primeiro admin (dono do banco, auth.uid() nulo)
update public.profiles set papel='admin' where email='admin@x.com';

-- ===== ADMIN publica um oficial antes de tudo
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho,status,origem,autor_nome) values ('r2a-cardiovascular-001','basico','Oficial?','Sim','cardiovascular','fisiologia','oficial','aprovado','seed','Road to America') returning id,status;
reset role;

-- ===== como ANA (participante)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo '--- T1 escalada de papel (deve falhar)'
update public.profiles set papel='admin' where id=auth.uid();
\echo '--- T1b trocar o e-mail do perfil (e-mail continua ana@x.com)'
update public.profiles set email='admin@x.com', nome='Ana B.' where id=auth.uid() returning email, nome;
\echo '--- T2 card pessoal com status aprovado (deve falhar); sem status, entra como rascunho'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho,status) values ('r2a-respiratorio-999','basico','Q?','A','cardiovascular','farmacologia','pessoal','aprovado') returning id like 'u-%' as id_gerado, status, autor_id, versao;
insert into public.cards (tipo,frente,verso,sistema,disciplina,baralho) values ('basico','Q?','A','cardiovascular','farmacologia','pessoal') returning id as p1b \gset
\echo '--- T3 enviar à comunidade com nome forjado (autor_nome vira Ana B.)'
insert into public.cards (tipo,frente,verso,sistema,disciplina,baralho,status,autor_nome) values ('basico','Q2?','A2','cardiovascular','farmacologia','comunidade','em_revisao','Road to America') returning id as c1, status, autor_nome \gset
\echo :c1
\echo '--- T4 criar oficial (deve falhar)'
insert into public.cards (tipo,frente,verso,sistema,disciplina,baralho) values ('basico','Q?','A','cardiovascular','farmacologia','oficial');
\echo '--- T4b ocupar o id de um oficial via upsert (o banco gera outro id; o oficial fica intacto)'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho) values ('r2a-cardiovascular-001','basico','hack','hack','cardiovascular','farmacologia','pessoal') on conflict (id) do update set frente='hack';
\echo '--- T5 aprovar o próprio (deve falhar)'
update public.cards set status='aprovado' where id=:'c1';
\echo '--- T6 forjar autor (autor vira ana)'
insert into public.cards (tipo,frente,verso,sistema,disciplina,baralho,autor_id) values ('basico','Q3?','A3','cardiovascular','farmacologia','pessoal','00000000-0000-0000-0000-00000000000c') returning autor_id;
\echo '--- T6b sinalização com status resolvida (vira aberta)'
insert into public.sinalizacoes (card_id, motivo, status) values ('r2a-cardiovascular-001','outro','resolvida') returning status, autor_nome;
reset role;

-- ===== como ADMIN
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo '--- T7 admin aprova c1'
update public.cards set status='aprovado', revisor_id=auth.uid(), comentario_revisao='ok' where id=:'c1' returning id,status,versao;
select count(*) as admin_ve_todos from public.cards;
reset role;

-- ===== como BIA (outra participante)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
\echo '--- T8 bia vê oficial + c1 aprovado, não vê pessoais da ana (esperado: 2 linhas)'
select id, baralho from public.cards order by id;
\echo '--- T9 bia edita card da ana / oficial (0 linhas)'
update public.cards set frente='hack' where id=:'c1';
update public.cards set frente='hack' where id='r2a-cardiovascular-001';
delete from public.cards where id='r2a-cardiovascular-001';
\echo '--- T10 bia estado SRS próprio ok; de outra pessoa falha'
insert into public.srs_estado (card_id, ord, due, state) values (:'c1',1,now(),2) returning user_id;
insert into public.srs_estado (user_id, card_id, ord, due, state) values ('00000000-0000-0000-0000-00000000000b',:'c1',1,now(),2);
insert into public.revlog (card_id, ord, rating, state) values (:'c1',1,3,2) returning user_id;
\echo '--- T11 sinalização (status forçado aberta) e não resolve (0 linhas)'
insert into public.sinalizacoes (card_id, motivo, texto, status) values (:'c1','erro_factual','dose errada','resolvida') returning status;
update public.sinalizacoes set status='resolvida';
\echo '--- T11b sinalizar card invisível (pessoal da ana) falha'
insert into public.sinalizacoes (card_id, motivo) values (:'p1b','outro');
reset role;

-- ===== ANA edita c1 aprovado: volta para em_revisao e versao+1
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo '--- T12 ana edita c1 aprovado -> em_revisao, versao 2'
update public.cards set verso='A2 corrigida' where id=:'c1' returning status, versao;
\echo '--- T12b ana troca só o autor_nome de card aprovado (nome continua)'
update public.cards set autor_nome='Road to America' where id=:'c1' returning autor_nome;
\echo '--- T13 ana altera SRS da bia (0 linhas)'
update public.srs_estado set due=now() + interval '1 year' where user_id='00000000-0000-0000-0000-00000000000c';
\echo '--- T14 ana não vê srs nem sinalizações da bia (esperado 0 e 1)'
select count(*) as srs_visiveis from public.srs_estado;
select count(*) as sinalizacoes_visiveis from public.sinalizacoes;
\echo '--- T15 histórico visível para ana (cards dela)'
select card_id, versao, acao from public.card_historico order by id;
\echo '--- T16 ana apaga pessoal ok, oficial não'
delete from public.cards where id=:'p1b' returning id;
delete from public.cards where id='r2a-cardiovascular-001' returning id;
reset role;

-- ===== ADMIN promove c1 a oficial e resolve sinalização
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
update public.cards set status='aprovado' where id=:'c1';
update public.cards set baralho='oficial' where id=:'c1' returning baralho, status;
update public.sinalizacoes set status='resolvida', resposta='corrigido' returning status;
select card_id, versao, acao from public.card_historico where card_id=:'c1' order by id;
reset role;
\echo '--- T17 anon não lê nada'
set role anon; select count(*) from public.cards; reset role;

-- =============================================================================
-- PLATAFORMA: simulados, autoavaliações NBME, presença, plano, metas e funções
-- do painel. Aqui cada verificação grava OK ou FALHOU em teste.resultado e o
-- resumo final precisa mostrar falhas = 0.
-- =============================================================================
reset role;
drop schema if exists teste cascade;
create schema teste;
create table teste.resultado (id serial primary key, nome text, ok boolean, detalhe text);
grant usage on schema teste to authenticated, anon;
grant select, insert on teste.resultado to authenticated, anon;
grant usage on sequence teste.resultado_id_seq to authenticated, anon;
create function teste.ok(p_nome text, p_cond boolean, p_detalhe text default '') returns text language plpgsql as $$
begin
  insert into teste.resultado (nome, ok, detalhe) values (p_nome, coalesce(p_cond, false), p_detalhe);
  return case when coalesce(p_cond, false) then 'OK     ' else 'FALHOU ' end || p_nome || case when p_detalhe <> '' then ' (' || p_detalhe || ')' else '' end;
end $$;
-- A instrução precisa falhar ou afetar 0 linhas
create function teste.bloqueia(p_nome text, p_sql text) returns text language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    return teste.ok(p_nome, true, 'bloqueado: ' || sqlerrm);
  end;
  return teste.ok(p_nome, n = 0, n || ' linha(s) afetada(s)');
end $$;
-- A instrução precisa funcionar e afetar pelo menos 1 linha
create function teste.passa(p_nome text, p_sql text) returns text language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    return teste.ok(p_nome, false, 'erro: ' || sqlerrm);
  end;
  return teste.ok(p_nome, n > 0, n || ' linha(s)');
end $$;
grant execute on all functions in schema teste to authenticated, anon;

\set ana '00000000-0000-0000-0000-00000000000b'
\set bia '00000000-0000-0000-0000-00000000000c'
\set adm '00000000-0000-0000-0000-00000000000a'

-- ===== ANA (participante)
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- P1 simulados da Ana'
insert into public.simulados (user_id, step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos, por_sistema)
values (:'bia', 'step1', array['s1-001','s1-002'], array['C', null], array[false, true], array[80000, 95000],
        now() - interval '20 minutes', now() - interval '17 minutes', 175000, 2, 1, '{"cardiovascular":{"total":2,"acertos":1}}')
returning id as sim1, user_id = auth.uid() as dono_forcado, percentual \gset
select teste.ok('P1a simulado gravado com dono forçado para a Ana', :'dono_forcado'::boolean);
select teste.ok('P1b percentual calculado pelo banco', :'percentual'::numeric = 0.5);
select teste.bloqueia('P1c simulado com fim no futuro',
  $q$insert into public.simulados (step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos)
     values ('step1', array['a'], array['A'], array[false], array[1], now(), now() + interval '1 day', 1, 1, 1)$q$);
select teste.bloqueia('P1d simulado com tamanhos inconsistentes',
  $q$insert into public.simulados (step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos)
     values ('step1', array['a','b'], array['A'], array[false], array[1], now() - interval '1 hour', now() - interval '50 minutes', 1, 2, 1)$q$);
select teste.bloqueia('P1e acertos acima do total',
  $q$insert into public.simulados (step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos)
     values ('step1', array['a'], array['A'], array[false], array[1], now() - interval '1 hour', now() - interval '50 minutes', 1, 1, 3)$q$);
select teste.bloqueia('P1f Ana altera a própria tentativa', format('update public.simulados set acertos = 2 where id = %L', :'sim1'));
select teste.bloqueia('P1g Ana apaga a própria tentativa', format('delete from public.simulados where id = %L', :'sim1'));

\echo '--- P2 autoavaliações NBME da Ana'
insert into public.nbme_autoavaliacoes (user_id, step, formulario, data, escore, probabilidade, verificada, verificada_por)
values (:'bia', 'step1', 'CBSSA Form 31', current_date - 10, 205, 78.5, true, :'ana')
returning id as nb1, user_id = auth.uid() as nb_dono, verificada as nb_ver \gset
select teste.ok('P2a NBME gravado no nome da Ana e sem verificação', :'nb_dono'::boolean and not :'nb_ver'::boolean);
select teste.passa('P2b Ana corrige a própria NBME não verificada', format('update public.nbme_autoavaliacoes set probabilidade = 81 where id = %L', :'nb1'));
update public.nbme_autoavaliacoes set verificada = true where id = :'nb1' returning verificada as nb_auto \gset
select teste.ok('P2c Ana não consegue se autoverificar', not :'nb_auto'::boolean);
select teste.bloqueia('P2d NBME com data no futuro',
  $q$insert into public.nbme_autoavaliacoes (step, formulario, data, escore) values ('step1', 'CBSSA Form 32', current_date + 30, 200)$q$);
select teste.bloqueia('P2e NBME sem escore nem equivalente',
  $q$insert into public.nbme_autoavaliacoes (step, formulario, data) values ('step1', 'CBSSA Form 32', current_date)$q$);
select teste.bloqueia('P2f probabilidade acima de 100',
  $q$insert into public.nbme_autoavaliacoes (step, formulario, data, escore, probabilidade) values ('step1', 'CBSSA Form 32', current_date, 200, 120)$q$);
insert into public.nbme_autoavaliacoes (step, formulario, data, escore_texto, modo) values ('step2ck', 'CCSSA Form 12', current_date - 3, 'faixa 240-255', 'self') returning id as nb2 \gset

\echo '--- P3 presença e plano da Ana'
select teste.bloqueia('P3a Ana lança a própria presença', format('insert into public.presenca (user_id, aulas_assistidas, aulas_totais) values (%L, 40, 40)', :'ana'));
select teste.passa('P3b Ana grava a data da prova', format('insert into public.plano_participante (user_id, data_prova_step1) values (%L, current_date + 45)', :'ana'));
select teste.bloqueia('P3c Ana se declara aprovada no Step 1', 'update public.plano_participante set step1_aprovado = true');
select teste.bloqueia('P3d Ana muda a data de matrícula', 'update public.plano_participante set data_matricula = current_date');
select teste.passa('P3e Ana muda a data da prova', 'update public.plano_participante set data_prova_step1 = current_date + 50');
select teste.bloqueia('P3f Ana altera as metas da coorte', $q$update public.plataforma_config set dados = '{"meta_probabilidade": 10}'$q$);
select teste.ok('P3g Ana lê as metas da coorte', (select count(*) from public.plataforma_config) = 1);
reset role;

-- ===== BIA (outra participante)
set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
\echo '--- P4 Bia não vê nem mexe nos dados da Ana'
select teste.ok('P4a Bia não vê simulados da Ana', (select count(*) from public.simulados where user_id = :'ana') = 0);
select teste.ok('P4b Bia não vê NBMEs da Ana', (select count(*) from public.nbme_autoavaliacoes where user_id = :'ana') = 0);
select teste.ok('P4c Bia não vê o plano da Ana', (select count(*) from public.plano_participante where user_id = :'ana') = 0);
select teste.bloqueia('P4d Bia altera NBME da Ana', format('update public.nbme_autoavaliacoes set probabilidade = 99 where id = %L', :'nb1'));
select teste.bloqueia('P4e Bia apaga NBME da Ana', format('delete from public.nbme_autoavaliacoes where id = %L', :'nb1'));
insert into public.simulados (user_id, step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos)
values (:'ana', 'step2ck', array['ck-001'], array['B'], array[false], array[70000], now() - interval '2 hours', now() - interval '119 minutes', 70000, 1, 1)
returning user_id = auth.uid() as bia_dona \gset
select teste.ok('P4f simulado da Bia com user_id forjado fica no nome da Bia', :'bia_dona'::boolean);
select teste.bloqueia('P4g Bia chama o painel do admin', 'select * from public.r2a_admin_resumo_participantes()');
select teste.bloqueia('P4h Bia chama a função interna', format('select * from public.r2a_resumo_interno(array[%L]::uuid[])', :'ana'));
select teste.bloqueia('P4i Bia importa presença', $q$select public.r2a_admin_importar_presenca('[{"email":"bia@x.com","aulas_assistidas":40,"aulas_totais":40}]')$q$);
select teste.ok('P4j atividade diária da Ana vista pela Bia vem zerada',
  (select coalesce(sum(revisoes), 0) from public.r2a_atividade_diaria(:'ana'::uuid, 30)) = 0);
reset role;

-- ===== ADMIN
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- P5 admin'
update public.nbme_autoavaliacoes set verificada = true where id = :'nb1'
returning verificada_por = auth.uid() and verificada_em is not null as carimbo \gset
select teste.ok('P5a admin verifica NBME com carimbo de quem e quando', :'carimbo'::boolean);
select teste.passa('P5b admin lança presença da Ana', format('insert into public.presenca (user_id, aulas_assistidas, aulas_totais) values (%L, 30, 40)', :'ana'));
select teste.ok('P5c presença registra quem lançou', (select atualizado_por = auth.uid() from public.presenca where user_id = :'ana'));
select teste.passa('P5d admin marca Step 1 aprovado', format('update public.plano_participante set step1_aprovado = true, data_matricula = current_date - 200 where user_id = %L', :'ana'));
select teste.passa('P5e admin atualiza as metas', $q$update public.plataforma_config set dados = '{"meta_probabilidade": 90}'$q$);
select r2a_admin_importar_presenca(format('[{"email":"BIA@x.com","aulas_assistidas":20,"aulas_totais":40},{"email":"ninguem@x.com","aulas_assistidas":1,"aulas_totais":2},{"email":"ana@x.com","aulas_assistidas":50,"aulas_totais":40}]')::jsonb) as imp \gset
select teste.ok('P5f importação CSV: 1 atualizado, 1 não encontrado, 1 erro',
  (:'imp'::jsonb ->> 'atualizados')::int = 1 and :'imp'::jsonb -> 'nao_encontrados' = '["ninguem@x.com"]'::jsonb
  and jsonb_array_length(:'imp'::jsonb -> 'erros') = 1, :'imp');
select teste.ok('P5g painel do admin traz Ana e Bia (sem o admin)',
  (select count(*) from public.r2a_admin_resumo_participantes()) = 2);
select teste.ok('P5h admin vê todos os simulados', (select count(*) from public.simulados) = 2);
select teste.passa('P5i admin apaga uma tentativa', format('delete from public.simulados where user_id = %L', :'bia'));
reset role;

-- ===== ANA de novo: tentativa verificada fica travada
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- P6 NBME verificada travada e resumo da Ana'
select teste.bloqueia('P6a Ana altera NBME já verificada', format('update public.nbme_autoavaliacoes set probabilidade = 99 where id = %L', :'nb1'));
select teste.bloqueia('P6b Ana apaga NBME já verificada', format('delete from public.nbme_autoavaliacoes where id = %L', :'nb1'));
select teste.passa('P6c Ana apaga NBME não verificada', format('delete from public.nbme_autoavaliacoes where id = %L', :'nb2'));
select teste.bloqueia('P6d Ana altera a própria presença', 'update public.presenca set aulas_assistidas = 40');
select teste.ok('P6e Ana lê a própria presença', (select aulas_assistidas from public.presenca) = 30);
select r2a_meu_resumo() as meu \gset
select teste.ok('P6f meu resumo: 1 simulado de Step 1, 1 NBME, presença 30/40, Step 1 aprovado',
  (:'meu'::jsonb #>> '{simulados,step1,n}')::int = 1
  and jsonb_array_length(:'meu'::jsonb -> 'nbme') = 1
  and (:'meu'::jsonb #>> '{presenca,aulas_assistidas}')::int = 30
  and (:'meu'::jsonb #>> '{plano,step1_aprovado}')::boolean
  and (:'meu'::jsonb ->> 'user_id') = :'ana');
reset role;

-- ===== ANOTAÇÕES DO MENTOR (área administrativa): só o admin lê e grava
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- P8 anotações do mentor'
select teste.passa('P8a admin grava anotação sobre a Ana', format($q$insert into public.anotacoes_mentor (user_id, texto, atualizado_por) values (%L, 'Conversa marcada', %L)$q$, :'ana', :'bia'));
select teste.ok('P8b anotação carimba quem gravou (não aceita autor forjado)', (select atualizado_por = auth.uid() from public.anotacoes_mentor where user_id = :'ana'));
select teste.bloqueia('P8c anotação acima de 5000 caracteres', format('update public.anotacoes_mentor set texto = repeat(%L, 5001) where user_id = %L', 'x', :'ana'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
select teste.ok('P8d Ana não lê a anotação sobre ela', (select count(*) from public.anotacoes_mentor) = 0);
select teste.bloqueia('P8e Ana grava anotação sobre si', format($q$insert into public.anotacoes_mentor (user_id, texto) values (%L, 'tudo certo')$q$, :'ana'));
select teste.bloqueia('P8f Ana altera a anotação', $q$update public.anotacoes_mentor set texto = 'apagado'$q$);
select teste.bloqueia('P8g Ana apaga a anotação', 'delete from public.anotacoes_mentor');
reset role;
set role anon;
select teste.bloqueia('P8h anon lê anotações', 'select * from public.anotacoes_mentor');
reset role;

-- ===== ANON
set role anon;
\echo '--- P7 anon'
select teste.bloqueia('P7a anon lê simulados', 'select * from public.simulados');
select teste.bloqueia('P7b anon lê NBMEs', 'select * from public.nbme_autoavaliacoes');
select teste.bloqueia('P7c anon lê presença', 'select * from public.presenca');
select teste.bloqueia('P7d anon chama meu resumo', 'select public.r2a_meu_resumo()');
select teste.bloqueia('P7e anon chama painel do admin', 'select * from public.r2a_admin_resumo_participantes()');
reset role;

-- ===== P9: ataques extras (com os privilégios padrão do Supabase simulados no 01)
-- Executa a instrução e desfaz tudo; devolve true se o banco recusou com erro.
reset role;
create or replace function teste.recusa(p_sql text) returns boolean language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'r2a_passou';
  exception when others then
    return sqlerrm <> 'r2a_passou';
  end;
end $$;
grant execute on function teste.recusa(text) to authenticated, anon;

set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
\echo '--- P9 ataques da Bia (participante)'
select teste.ok('P9a Bia esvazia a presença com TRUNCATE', teste.recusa('truncate public.presenca'));
select teste.ok('P9b Bia esvazia as NBMEs com TRUNCATE', teste.recusa('truncate public.nbme_autoavaliacoes cascade'));
select teste.ok('P9c Bia esvazia as anotações do mentor com TRUNCATE', teste.recusa('truncate public.anotacoes_mentor'));
select teste.ok('P9d Bia esvazia o revlog com TRUNCATE', teste.recusa('truncate public.revlog'));
select teste.ok('P9e Bia não lê o perfil (e-mail) da Ana', (select count(*) from public.profiles where id = :'ana') = 0);
select teste.bloqueia('P9f Bia se promove a admin', 'update public.profiles set papel = ''admin'' where id = auth.uid()');
select teste.bloqueia('P9g Bia altera a presença da Ana', format('update public.presenca set aulas_assistidas = 0 where user_id = %L', :'ana'));
select teste.bloqueia('P9h Bia apaga a presença da Ana', format('delete from public.presenca where user_id = %L', :'ana'));
select teste.bloqueia('P9i Bia marca a NBME da Ana como verificada', format('update public.nbme_autoavaliacoes set verificada = true where id = %L', :'nb1'));
select teste.bloqueia('P9j Bia muda a data da prova da Ana', format('update public.plano_participante set data_prova_step1 = current_date where user_id = %L', :'ana'));
insert into public.plano_participante (user_id, data_prova_step2ck) values (:'ana', current_date + 90)
  on conflict (user_id) do update set data_prova_step2ck = excluded.data_prova_step2ck
  returning user_id = auth.uid() as plano_dono \gset
select teste.ok('P9k plano gravado pela Bia com user_id da Ana fica no nome da Bia', :'plano_dono'::boolean);
select teste.ok('P9l Bia não lê anotações do mentor', (select count(*) from public.anotacoes_mentor) = 0);
select teste.ok('P9m meu resumo da Bia traz só a Bia', (select public.r2a_meu_resumo() ->> 'user_id') = :'bia');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- P9 ataques da Ana nas próprias NBMEs'
insert into public.nbme_autoavaliacoes (step, formulario, data, escore, verificada, verificada_por, verificada_em)
values ('step2ck', 'CCSSA Form 13', current_date - 1, 230, false, :'adm', now())
returning id as nb3, verificada_por is null and verificada_em is null as sem_carimbo \gset
select teste.ok('P9n Ana não forja o carimbo de verificação', :'sem_carimbo'::boolean);
update public.nbme_autoavaliacoes set user_id = :'bia' where id = :'nb3' returning user_id = auth.uid() as continua_ana \gset
select teste.ok('P9o Ana não transfere a própria NBME para a Bia', :'continua_ana'::boolean);
reset role;

set role anon;
\echo '--- P9 anon'
select teste.ok('P9p anon esvazia a presença com TRUNCATE', teste.recusa('truncate public.presenca'));
select teste.bloqueia('P9q anon chama a atividade diária', format('select * from public.r2a_atividade_diaria(%L::uuid)', :'ana'));
select teste.bloqueia('P9r anon importa presença', $q$select public.r2a_admin_importar_presenca('[]')$q$);
select teste.bloqueia('P9s anon chama a função interna', format('select * from public.r2a_resumo_interno(array[%L]::uuid[])', :'ana'));
reset role;

\echo '--- P9 estrutura das funções security definer'
select teste.ok('P9t toda função security definer do esquema public tem search_path fixo',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef
                and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));
select teste.ok('P9u nenhuma tabela da plataforma dá TRUNCATE, REFERENCES ou TRIGGER a anon ou authenticated',
  not exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and grantee in ('anon', 'authenticated')
                and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  (select string_agg(distinct table_name || ':' || grantee || ':' || privilege_type, ', ') from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
select teste.ok('P9v authenticated não executa a função interna do resumo',
  not has_function_privilege('authenticated', 'public.r2a_resumo_interno(uuid[], text, timestamptz)', 'execute'));

\echo '=== RESUMO DA PLATAFORMA (falhas precisa ser 0)'
select count(*) filter (where not ok) as falhas, count(*) as verificacoes from teste.resultado;
select nome, detalhe from teste.resultado where not ok;
