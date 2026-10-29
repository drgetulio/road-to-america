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

-- =============================================================================
-- BANCO DE QUESTÕES (Q1 a Q10): questões, respostas por item, simulados
-- completos, anotações do aluno, reportes, resultados oficiais e funções do admin
-- =============================================================================
\set item1 '{"id":"R2A-S1-0001","step":"step1","versao":1,"vinheta":"A 54-year-old man has crushing chest pain for 3 days.","pergunta":"Which of the following is most likely?","alternativas":[{"letra":"A","texto":"a"},{"letra":"B","texto":"b"},{"letra":"C","texto":"c"},{"letra":"D","texto":"d"},{"letra":"E","texto":"e"}],"correta":"C","explicacao":"Coagulative necrosis at 3 days.","explicacoes_alternativas":{"C":"Correct."},"explicacao_pt":"Necrose de coagulação.","objetivo_educacional":"Timeline of infarction.","conceito_testado":"Infarct day 3","topico":"Myocardial infarction","fonte":"Robbins 2020","tags":["infarto"],"revisao":{"verificado":true,"notas":"interna"},"sistema":"cardiovascular","disciplina":"patologia","competencia":"applying_foundational_science","dificuldade":"media","angoff":0.62}'
\set item2 '{"id":"R2A-S1-0002","step":"step1","vinheta":"A 30-year-old woman has fatigue for 2 months.","pergunta":"Which of the following is most likely?","alternativas":[{"letra":"A","texto":"a"},{"letra":"B","texto":"b"},{"letra":"C","texto":"c"},{"letra":"D","texto":"d"},{"letra":"E","texto":"e"}],"correta":"A","sistema":"sangue_imune","disciplina":"patologia","dificuldade":"dificil"}'
\set sessao0 '{"bloco_atual":0,"respostas":[[{"resposta":null,"marcada":false,"tempo_ms":0}],[{"resposta":null,"marcada":false,"tempo_ms":0}]]}'
\set sessao1 '{"bloco_atual":1,"respostas":[[{"resposta":"C","marcada":false,"tempo_ms":60000}],[{"resposta":null,"marcada":false,"tempo_ms":0}]]}'
\set sessao2 '{"bloco_atual":2,"respostas":[[{"resposta":"C","marcada":false,"tempo_ms":60000}],[{"resposta":"B","marcada":true,"tempo_ms":45000}]],"encerramentos":[{"bloco":0,"fim":"2099-10-29T10:00:00Z"},{"bloco":1,"fim":"2099-10-29T10:30:00Z"}]}'
\set form2 '{"id":"step1:prontidao:fixo:S1-A:x","step":"step1","tipo":"prontidao","blocos":[["R2A-S1-0001"],["R2A-S1-0002"]]}'

set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- Q1 admin publica questões e ativa a matrícula da Ana'
select teste.passa('Q1a admin insere questão', format('insert into public.questoes (id, step, dados) values (%L, %L, %L::jsonb)', 'R2A-S1-0001', 'step1', :'item1'));
select teste.ok('Q1b gatilho deriva gabarito, Angoff e classificação dos dados',
  (select correta = 'C' and angoff = 0.62 and sistema = 'cardiovascular' and versao = 1 from public.questoes where id = 'R2A-S1-0001'));
select teste.bloqueia('Q1c questão com gabarito fora das alternativas',
  format('insert into public.questoes (id, step, dados) values (%L, %L, %L::jsonb)', 'R2A-S1-0099', 'step1', replace(:'item1', '"correta":"C"', '"correta":"H"')));
select teste.passa('Q1d admin insere questão suspensa (Angoff padrão da dificuldade)', format('insert into public.questoes (id, step, status, dados) values (%L, %L, %L, %L::jsonb)', 'R2A-S1-0002', 'step1', 'suspenso', :'item2'));
select teste.ok('Q1e sem angoff, o banco usa 0,45 para item difícil', (select angoff = 0.45 from public.questoes where id = 'R2A-S1-0002'));
select teste.passa('Q1f admin ativa a matrícula da Ana', format('update public.profiles set ativo = true where id = %L', :'ana'));
reset role;

set role anon;
\echo '--- Q2 anon'
select teste.bloqueia('Q2a anon lê questões', 'select * from public.questoes');
select teste.bloqueia('Q2b anon grava resposta', $q$insert into public.respostas_item (questao_id, step, resposta, modo, origem) values ('R2A-S1-0001', 'step1', 'C', 'cronometrado', 'banco')$q$);
select teste.bloqueia('Q2c anon lê respostas', 'select * from public.respostas_item');
select teste.bloqueia('Q2d anon chama as estatísticas de itens', 'select * from public.r2a_admin_estatisticas_itens()');
select teste.bloqueia('Q2e anon chama a matriz de respostas', 'select * from public.r2a_admin_respostas_calibracao()');
select teste.bloqueia('Q2f anon lê simulados completos', 'select * from public.simulados_completos');
select teste.bloqueia('Q2g anon lê reportes', 'select * from public.reportes_item');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
\echo '--- Q3 Bia sem matrícula ativa'
select teste.ok('Q3a Bia (inativa) não lê nenhuma questão', (select count(*) from public.questoes) = 0);
select teste.bloqueia('Q3b Bia ativa a própria matrícula', 'update public.profiles set ativo = true where id = auth.uid()');
select teste.ok('Q3c pode_ler_banco() é falso para a Bia', not public.pode_ler_banco());
select teste.ok('Q3d Bia (inativa) não lê o espelho público das questões', (select count(*) from public.questoes_publicas) = 0);
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- Q4 Ana (matrícula ativa)'
select teste.ok('Q4a Ana não lê a tabela com gabarito; lê só a questão ativa no espelho público', (select count(*) from public.questoes) = 0
  and (select count(*) from public.questoes_publicas) = 1 and (select count(*) from public.questoes_publicas where id = 'R2A-S1-0002') = 0);
select teste.ok('Q4a2 o espelho público não traz gabarito, explicações, objetivo, conceito, tópico, fonte, tags nem revisão',
  (select not (dados ?| array['correta','explicacao','explicacoes_alternativas','explicacao_pt','objetivo_educacional','conceito_testado','topico','fonte','tags','revisao'])
     and dados ->> 'vinheta' like 'A 54-year-old%' and jsonb_array_length(dados -> 'alternativas') = 5 and angoff = 0.62 and sistema = 'cardiovascular'
   from public.questoes_publicas where id = 'R2A-S1-0001'));
select teste.bloqueia('Q4a3 Ana escreve no espelho público', $q$update public.questoes_publicas set dados = '{}' where id = 'R2A-S1-0001'$q$);
select teste.bloqueia('Q4b Ana altera o gabarito (coluna)', $q$update public.questoes set correta = 'A' where id = 'R2A-S1-0001'$q$);
select teste.bloqueia('Q4c Ana altera o gabarito (dados)', $q$update public.questoes set dados = jsonb_set(dados, '{correta}', '"A"') where id = 'R2A-S1-0001'$q$);
select teste.bloqueia('Q4d Ana insere questão', format('insert into public.questoes (id, step, dados) values (%L, %L, %L::jsonb)', 'R2A-S1-0050', 'step1', replace(:'item1', 'R2A-S1-0001', 'R2A-S1-0050')));
select teste.bloqueia('Q4e Ana apaga questão', $q$delete from public.questoes where id = 'R2A-S1-0001'$q$);
select teste.ok('Q4f Ana não lê o gabarito (nem na tabela, nem no espelho)', (select count(*) from public.questoes) = 0 and not exists (select 1 from public.questoes_publicas where dados ? 'correta'));
select teste.bloqueia('Q4f2 Ana grava resposta direto na tabela (só pelas funções)', $q$insert into public.respostas_item (questao_id, step, resposta, modo, origem) values ('R2A-S1-0001', 'step1', 'C', 'cronometrado', 'banco')$q$);
select teste.ok('Q4f3 Ana não recebe a correção de item que não respondeu', public.r2a_revelar(array['R2A-S1-0001']) = '{}'::jsonb);
select public.r2a_responder(jsonb_build_array(jsonb_build_object('questao_id', 'R2A-S1-0001', 'resposta', 'A', 'modo', 'cronometrado', 'origem', 'banco',
  'sessao_id', 'blk-1', 'posicao', 0, 'respondida_em', (now() - interval '2 hours')::text, 'correta', true, 'user_id', :'bia', 'step', 'step2ck')), true) -> 0 as resp_a \gset
select teste.ok('Q4g resposta errada pela função, com acerto, dono e Step forjados: o banco corrige e só então revela',
  (:'resp_a'::jsonb ->> 'correta')::boolean = false and (:'resp_a'::jsonb -> 'revelado' ->> 'correta') = 'C'
  and (:'resp_a'::jsonb -> 'revelado' ->> 'explicacao') like 'Coagulative%' and (:'resp_a'::jsonb -> 'revelado' ->> 'topico') = 'Myocardial infarction'
  and (select user_id = auth.uid() and not correta and step = 'step1' and versao_item = 1 from public.respostas_item where id = (:'resp_a'::jsonb ->> 'id')::uuid));
select public.r2a_responder(jsonb_build_array(jsonb_build_object('questao_id', 'R2A-S1-0001', 'resposta', 'A', 'modo', 'cronometrado', 'origem', 'banco', 'sessao_id', 'blk-1', 'posicao', 0)), false) -> 0 as resp_rep \gset
select teste.ok('Q4g2 reenvio da mesma linha não duplica e, sem p_revelar, não traz explicação',
  (select count(*) from public.respostas_item where sessao_id = 'blk-1') = 1 and not (:'resp_rep'::jsonb ? 'revelado'));
select (public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"C","modo":"tutor","origem":"banco","sessao_id":"blk-2","posicao":0}]'::jsonb) -> 0 ->> 'correta')::boolean as resp_c \gset
select teste.ok('Q4h resposta certa marcada como certa pelo banco', :'resp_c'::boolean);
select teste.ok('Q4h2 depois de responder, a Ana recebe a correção do item pela revelação',
  (public.r2a_revelar(array['R2A-S1-0001','R2A-S1-0002']) -> 'R2A-S1-0001' ->> 'correta') = 'C' and not (public.r2a_revelar(array['R2A-S1-0002']) ? 'R2A-S1-0002'));
select teste.bloqueia('Q4h3 resposta de origem simulado pela função de responder', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"C","modo":"cronometrado","origem":"simulado"}]')$q$);
select teste.bloqueia('Q4h4 resposta a item suspenso', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0002","resposta":"A","modo":"cronometrado","origem":"banco"}]')$q$);
select teste.bloqueia('Q4i Ana altera a própria resposta', 'update public.respostas_item set correta = true');
select teste.bloqueia('Q4j Ana apaga a própria resposta', 'delete from public.respostas_item');
select public.r2a_responder(jsonb_build_array(jsonb_build_object('questao_id', 'R2A-S1-0001', 'resposta', 'B', 'modo', 'tutor', 'origem', 'banco', 'sessao_id', 'blk-3', 'posicao', 0, 'respondida_em', (now() + interval '1 day')::text)), false) -> 0 ->> 'id' as resp_fut \gset
select teste.ok('Q4k resposta com data no futuro fica com a data de agora', (select respondida_em <= now() from public.respostas_item where id = :'resp_fut'::uuid));
select teste.bloqueia('Q4l resposta com origem inválida', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"C","modo":"tutor","origem":"outro"}]')$q$);
insert into public.simulados_completos (user_id, step, tipo, formulario_id, formulario, sessao, estado)
values (:'bia', 'step1', 'prontidao', 'step1:prontidao:fixo:S1-A:x', :'form2'::jsonb, :'sessao0'::jsonb, 'concluido')
returning id as sc1, user_id = auth.uid() and estado = 'em_andamento' as sc_ok \gset
select teste.ok('Q4m simulado completo criado no nome da Ana e em andamento', :'sc_ok'::boolean);
select teste.bloqueia('Q4m2 item de simulado em andamento não é corrigido antes do fim', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"C","modo":"tutor","origem":"banco"}]')$q$);
select teste.ok('Q4m3 nem revelado antes do fim', public.r2a_revelar(array['R2A-S1-0001']) = '{}'::jsonb);
select teste.bloqueia('Q4m4 correção antes do último bloco', format('select public.r2a_corrigir_simulado(%L)', :'sc1'));
select teste.passa('Q4n Ana encerra o bloco 1 (avança para o 2)', format('update public.simulados_completos set sessao = %L::jsonb where id = %L', :'sessao1', :'sc1'));
select teste.ok('Q4o bloco_atual derivado da sessão', (select bloco_atual = 1 from public.simulados_completos where id = :'sc1'));
select teste.bloqueia('Q4p Ana muda a resposta de um bloco encerrado', format('update public.simulados_completos set sessao = jsonb_set(sessao, %L, %L) where id = %L', '{respostas,0,0,resposta}', '"A"', :'sc1'));
select teste.bloqueia('Q4q Ana volta ao bloco encerrado', format('update public.simulados_completos set sessao = %L::jsonb where id = %L', :'sessao0', :'sc1'));
update public.simulados_completos set formulario = '{"blocos":[["R2A-S1-0002"],["R2A-S1-0001"]]}'::jsonb, tipo = 'completo' where id = :'sc1';
select teste.ok('Q4r formulário e tipo não mudam depois de criados', (select formulario = :'form2'::jsonb and tipo = 'prontidao' from public.simulados_completos where id = :'sc1'));
select teste.bloqueia('Q4s Ana conclui o simulado direto, com resultado forjado', format($q$update public.simulados_completos set estado = 'concluido', resultado = '{"acertos":2}' where id = %L$q$, :'sc1'));
select teste.passa('Q4s2 Ana encerra o último bloco', format('update public.simulados_completos set sessao = %L::jsonb where id = %L', :'sessao2', :'sc1'));
select public.r2a_corrigir_simulado(:'sc1', '{"estimativa":{"p_aprovacao":0.5},"acertos":99}'::jsonb) as corr1 \gset
select teste.ok('Q4s3 correção no servidor: acertos do servidor (o complemento não muda a nota), uma resposta por item e revelação no fim',
  (:'corr1'::jsonb -> 'resultado' ->> 'acertos')::int = 1 and (:'corr1'::jsonb -> 'resultado' ->> 'total')::int = 2
  and (:'corr1'::jsonb -> 'resultado' -> 'estimativa' ->> 'p_aprovacao')::numeric = 0.5
  and (:'corr1'::jsonb -> 'itens' -> 0 -> 'revelado' ->> 'correta') = 'C' and (:'corr1'::jsonb -> 'itens' -> 1 ->> 'correta')::boolean = false
  and (select count(*) = 2 and bool_and(origem = 'simulado' and modo = 'cronometrado') from public.respostas_item where sessao_id = :'sc1')
  and (select estado = 'concluido' and (resultado ->> 'corrigido_no_servidor')::boolean from public.simulados_completos where id = :'sc1'));
select public.r2a_corrigir_simulado(:'sc1') as corr2 \gset
select teste.ok('Q4s4 corrigir de novo não duplica respostas', (select count(*) from public.respostas_item where sessao_id = :'sc1') = 2 and (:'corr2'::jsonb -> 'resultado' ->> 'acertos')::int = 1);
select teste.ok('Q4t conclusão carimba o fim', (select fim is not null from public.simulados_completos where id = :'sc1'));
select teste.bloqueia('Q4u Ana altera simulado concluído', format($q$update public.simulados_completos set resultado = '{"acertos":2}' where id = %L$q$, :'sc1'));
select teste.bloqueia('Q4v Ana apaga o próprio simulado', format('delete from public.simulados_completos where id = %L', :'sc1'));
select teste.bloqueia('Q4w formulário com 17 blocos',
  format('insert into public.simulados_completos (step, tipo, formulario_id, formulario, sessao) values (%L, %L, %L, %L::jsonb, %L::jsonb)', 'step1', 'completo', 'x',
    (select jsonb_build_object('blocos', jsonb_agg(jsonb_build_array('R2A-S1-0001'))) from generate_series(1, 17)), :'sessao0'));
select teste.passa('Q4x Ana grava anotação no item', $q$insert into public.anotacoes_item (questao_id, texto) values ('R2A-S1-0001', 'Revisar linha do tempo do infarto')$q$);
select teste.bloqueia('Q4y anotação acima de 5000 caracteres', $q$update public.anotacoes_item set texto = repeat('x', 5001)$q$);
insert into public.reportes_item (questao_id, motivo, texto, status, resposta, autor_nome)
values ('R2A-S1-0001', 'gabarito', 'Acho que é B', 'resolvido', 'ok', 'Road to America')
returning id as rep1, status = 'aberto' and resposta = '' and autor_nome = 'Ana B.' and versao_item = 1 as rep_ok \gset
select teste.ok('Q4z reporte entra aberto, com o nome real e a versão do item', :'rep_ok'::boolean);
select teste.bloqueia('Q4aa Ana resolve o próprio reporte', format($q$update public.reportes_item set status = 'resolvido' where id = %L$q$, :'rep1'));
select teste.bloqueia('Q4ab Ana lança resultado oficial', format($q$insert into public.resultados_oficiais (user_id, step, data, resultado) values (%L, 'step1', current_date - 3, 'pass')$q$, :'ana'));
select teste.bloqueia('Q4ac Ana chama as estatísticas de itens', 'select * from public.r2a_admin_estatisticas_itens()');
select teste.bloqueia('Q4ad Ana chama a matriz de respostas', 'select * from public.r2a_admin_respostas_calibracao()');
select teste.bloqueia('Q4ae Ana grava calibração', $q$select public.r2a_admin_salvar_calibracao('[{"id":"R2A-S1-0001","b":-3}]')$q$);
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
\echo '--- Q5 Bia não vê nem mexe nos dados da Ana'
select teste.ok('Q5a Bia não lê respostas da Ana', (select count(*) from public.respostas_item where user_id = :'ana') = 0);
select teste.ok('Q5b Bia não lê simulados completos da Ana', (select count(*) from public.simulados_completos where user_id = :'ana') = 0);
select teste.ok('Q5c Bia não lê anotações da Ana', (select count(*) from public.anotacoes_item) = 0);
select teste.ok('Q5d Bia não lê reportes da Ana', (select count(*) from public.reportes_item) = 0);
select teste.bloqueia('Q5e Bia altera simulado da Ana', format('update public.simulados_completos set sessao = %L::jsonb where id = %L', :'sessao0', :'sc1'));
select teste.bloqueia('Q5f Bia altera anotação da Ana', $q$update public.anotacoes_item set texto = 'x'$q$);
select teste.bloqueia('Q5g Bia grava resposta direto no nome da Ana', format($q$insert into public.respostas_item (user_id, questao_id, step, resposta, modo, origem) values (%L, 'R2A-S1-0001', 'step1', 'B', 'cronometrado', 'banco')$q$, :'ana'));
select teste.bloqueia('Q5g2 Bia (inativa) chama a função de responder', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"B","modo":"cronometrado","origem":"banco"}]')$q$);
select teste.bloqueia('Q5g3 Bia (inativa) pede a revelação', $q$select public.r2a_revelar(array['R2A-S1-0001'])$q$);
select teste.bloqueia('Q5g4 Bia corrige o simulado da Ana', format('select public.r2a_corrigir_simulado(%L)', :'sc1'));
insert into public.anotacoes_item (user_id, questao_id, texto) values (:'ana', 'R2A-S1-0001', 'forjada')
  on conflict (user_id, questao_id) do update set texto = excluded.texto
  returning user_id = auth.uid() as anot_dona \gset
select teste.ok('Q5h anotação da Bia com user_id da Ana fica no nome da Bia', :'anot_dona'::boolean);
select teste.ok('Q5i Bia não lê a questão', (select count(*) from public.questoes) = 0);
reset role;
-- resposta da Bia lançada pelo admin (a Bia está inativa), para as estatísticas abaixo
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
insert into public.respostas_item (user_id, questao_id, step, resposta, modo, origem) values (:'bia', 'R2A-S1-0001', 'step1', 'B', 'cronometrado', 'banco');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- Q6 admin'
select teste.ok('Q6a admin lê as respostas da turma (3 da Ana pelo banco, 2 do simulado, 1 da Bia)', (select count(*) from public.respostas_item) = 6);
select teste.ok('Q6b admin vê a questão suspensa', (select count(*) from public.questoes) = 2);
select teste.ok('Q6c estatísticas: primeira resposta de cada pessoa (Ana errou, Bia errou)',
  (select n = 2 and acertos = 0 and opcoes = '{"A": 1, "B": 1}'::jsonb from public.r2a_admin_estatisticas_itens('step1') where questao_id = 'R2A-S1-0001'));
select teste.ok('Q6d matriz pseudonimizada: 2 pessoas numeradas, sem user_id',
  (select count(distinct pessoa) = 2 and max(pessoa) = 2 from public.r2a_admin_respostas_calibracao('step1')));
select teste.ok('Q6e matriz não expõe e-mail nem user_id',
  not exists (select 1 from pg_proc p where p.proname = 'r2a_admin_respostas_calibracao' and pg_get_function_result(p.oid) ~ 'user_id|email'));
select public.r2a_admin_salvar_calibracao('[{"id":"R2A-S1-0001","b":-0.4,"ep":0.3,"n":2}]') as cal_n \gset
select teste.ok('Q6f admin grava calibração', :'cal_n'::int = 1
  and (select b_calibrado = -0.4 and calibrado_em is not null from public.questoes where id = 'R2A-S1-0001'));
select teste.passa('Q6g admin corrige o conteúdo do item', $q$update public.questoes set dados = jsonb_set(dados, '{vinheta}', '"A 54-year-old man has crushing chest pain for 4 days."') where id = 'R2A-S1-0001'$q$);
select teste.ok('Q6h conteúdo novo: versão 2 e calibração apagada', (select versao = 2 and b_calibrado is null and (dados ->> 'versao') = '2' from public.questoes where id = 'R2A-S1-0001'));
select teste.ok('Q6i estatísticas só da versão atual (respostas da versão 1 saem)', (select count(*) from public.r2a_admin_estatisticas_itens('step1') where questao_id = 'R2A-S1-0001') = 0
  and (select n from public.r2a_admin_estatisticas_itens('step1', false, true) where questao_id = 'R2A-S1-0001') = 2);
update public.questoes set status = 'suspenso' where id = 'R2A-S1-0001' returning versao = 2 as status_sem_versao \gset
select teste.ok('Q6j mudar só o status não muda a versão', :'status_sem_versao'::boolean);
update public.reportes_item set status = 'resolvido', resposta = 'Gabarito conferido' where id = :'rep1' returning resolvido_por = auth.uid() and resolvido_em is not null and texto = 'Acho que é B' as rep_res \gset
select teste.ok('Q6k admin resolve o reporte com carimbo; o texto do aluno não muda', :'rep_res'::boolean);
insert into public.resultados_oficiais (user_id, step, data, escore) values (:'ana', 'step2ck', date '2026-01-10', 230) returning resultado = 'pass' and registrado_por = auth.uid() as res_ok \gset
select teste.ok('Q6l Step 2 CK com nota 230 depois de 01/07/2025 vira Pass', :'res_ok'::boolean);
select teste.bloqueia('Q6m Step 1 com nota de três dígitos', format($q$insert into public.resultados_oficiais (user_id, step, data, escore, resultado) values (%L, 'step1', current_date - 1, 230, 'pass')$q$, :'ana'));
select teste.bloqueia('Q6n Step 2 CK antigo sem Pass/Fail', format($q$insert into public.resultados_oficiais (user_id, step, data, escore) values (%L, 'step2ck', date '2024-01-10', 216)$q$, :'ana'));
select teste.bloqueia('Q6n2 Step 2 CK com nota 230 e Fail (contradiz o padrão de 218)', format($q$insert into public.resultados_oficiais (user_id, step, data, escore, resultado) values (%L, 'step2ck', date '2026-02-10', 230, 'fail')$q$, :'ana'));
select teste.ok('Q6o admin não lê as anotações privadas do aluno', (select count(*) from public.anotacoes_item) = 0);
select teste.passa('Q6p admin apaga simulado completo', format('delete from public.simulados_completos where id = %L', :'sc1'));
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- Q7 Ana de novo'
select teste.ok('Q7a Ana lê o próprio resultado oficial', (select count(*) from public.resultados_oficiais) = 1);
select teste.ok('Q7b questão suspensa some para a Ana', (select count(*) from public.questoes) = 0);
select teste.ok('Q7c Ana lê a própria anotação', (select count(*) from public.anotacoes_item) = 1);
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- Q9 modelos psicométricos'
select teste.passa('Q9a admin grava o modelo de desfechos do Step 1', $q$insert into public.modelos_psicometricos (step, dados) values ('step1', '{"desfechos":{"beta0":0.2,"beta1":1.9,"suficiente":true}}')$q$);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
select teste.ok('Q9b participante lê o modelo', (select count(*) from public.modelos_psicometricos) = 1);
select teste.bloqueia('Q9c participante altera o modelo', $q$update public.modelos_psicometricos set dados = '{}'$q$);
select teste.bloqueia('Q9d participante cria modelo', $q$insert into public.modelos_psicometricos (step, dados) values ('step2ck', '{}')$q$);
reset role;
set role anon;
select teste.bloqueia('Q9e anon lê o modelo', 'select * from public.modelos_psicometricos');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
\echo '--- Q8 ataques extras'
select teste.ok('Q8a Bia esvazia as questões com TRUNCATE', teste.recusa('truncate public.questoes'));
select teste.ok('Q8b Bia esvazia as respostas com TRUNCATE', teste.recusa('truncate public.respostas_item'));
select teste.bloqueia('Q8c Bia muda o próprio papel e a matrícula juntos', $q$update public.profiles set papel = 'admin', ativo = true where id = auth.uid()$q$);
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- Q10 revisão de itens: marca, gabarito com versão e histórico'
select public.r2a_admin_salvar_calibracao('[{"id":"R2A-S1-0001","b":0.3,"ep":0.2,"n":40}]') as cal10 \gset
select teste.passa('Q10a admin marca o item para revisão com nota', $q$select public.r2a_admin_marcar_revisao('R2A-S1-0001', true, 'p abaixo de 0,20 na turma')$q$);
select teste.ok('Q10b marca gravada e histórico com a nota',
  (select em_revisao and revisao_nota = 'p abaixo de 0,20 na turma' from public.questoes where id = 'R2A-S1-0001')
  and exists (select 1 from public.questoes_historico where questao_id = 'R2A-S1-0001' and acao = 'revisao' and de = 'nao' and para = 'sim' and motivo = 'p abaixo de 0,20 na turma' and editor_id = auth.uid()));
-- uma resposta da Ana na versão 2 (as anteriores são da versão 1, de conteúdo antigo),
-- lançada pelo admin porque o item está suspenso
insert into public.respostas_item (user_id, questao_id, step, resposta, modo, origem) values (:'ana', 'R2A-S1-0001', 'step1', 'A', 'cronometrado', 'banco');
select (public.r2a_admin_editar_gabarito('R2A-S1-0001', 'a', 'Revisão da referência: a alternativa A é a correta', true)) as gab10 \gset
select teste.ok('Q10c gabarito corrigido: versão sobe, calibração apagada, retorno com antes e depois',
  (select correta = 'A' and versao = 3 and (dados ->> 'correta') = 'A' and b_calibrado is null from public.questoes where id = 'R2A-S1-0001')
  and (:'gab10'::jsonb ->> 'de') = 'C' and (:'gab10'::jsonb ->> 'para') = 'A' and (:'gab10'::jsonb ->> 'versao')::int = 3);
select teste.ok('Q10d respostas da versão em vigor recorrigidas pela alternativa nova e levadas à versão nova; as da versão de conteúdo anterior ficam',
  (select bool_and(correta = (resposta = 'A')) and count(*) = 1 and count(*) = (:'gab10'::jsonb ->> 'recorrigidas')::int from public.respostas_item where questao_id = 'R2A-S1-0001' and versao_item = 3)
  and (select count(*) = 5 from public.respostas_item where questao_id = 'R2A-S1-0001' and versao_item = 1)
  and not exists (select 1 from public.respostas_item where questao_id = 'R2A-S1-0001' and versao_item = 2));
select teste.ok('Q10e histórico do gabarito: de C para A, versão 3, motivo e quantas respostas mudaram',
  exists (select 1 from public.questoes_historico where questao_id = 'R2A-S1-0001' and acao = 'gabarito' and de = 'C' and para = 'A' and versao = 3
    and motivo like 'Revisão da referência%' and recorrigidas = (:'gab10'::jsonb ->> 'recorrigidas')::int and editor_id = auth.uid()));
select teste.ok('Q10f estatísticas contam a resposta recorrigida, não as da versão de conteúdo anterior', (select n = 1 and acertos = 1 from public.r2a_admin_estatisticas_itens('step1') where questao_id = 'R2A-S1-0001'));
select teste.bloqueia('Q10g gabarito sem motivo', $q$select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'B', 'ok', true)$q$);
select teste.bloqueia('Q10h gabarito fora das alternativas', $q$select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'H', 'Teste de letra inexistente', true)$q$);
select teste.bloqueia('Q10i gabarito igual ao atual', $q$select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'A', 'Nada muda neste caso', true)$q$);
select teste.passa('Q10j admin devolve o item ao banco com motivo', $q$select public.r2a_admin_status_questao('R2A-S1-0001', 'ativo', 'Gabarito corrigido; item volta ao banco')$q$);
select teste.ok('Q10k histórico do status com o motivo', exists (select 1 from public.questoes_historico where questao_id = 'R2A-S1-0001' and acao = 'status' and de = 'suspenso' and para = 'ativo' and motivo = 'Gabarito corrigido; item volta ao banco'));
select teste.ok('Q10l o motivo não vaza para a próxima mudança da mesma sessão',
  coalesce(current_setting('r2a.motivo', true), '') = '');
select teste.bloqueia('Q10m admin escreve no histórico direto', $q$insert into public.questoes_historico (questao_id, versao, acao) values ('R2A-S1-0001', 1, 'status')$q$);
select teste.bloqueia('Q10n admin apaga o histórico', 'delete from public.questoes_historico');
select teste.bloqueia('Q10o status inválido pela função', $q$select public.r2a_admin_status_questao('R2A-S1-0001', 'publicado', '')$q$);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
select teste.bloqueia('Q10p Ana corrige o gabarito pela função', $q$select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'B', 'Tentativa de um participante', true)$q$);
select teste.bloqueia('Q10q Ana marca item para revisão', $q$select public.r2a_admin_marcar_revisao('R2A-S1-0001', false, '')$q$);
select teste.bloqueia('Q10r Ana muda o status pela função', $q$select public.r2a_admin_status_questao('R2A-S1-0001', 'suspenso', '')$q$);
select teste.ok('Q10s Ana não lê o histórico das questões', (select count(*) from public.questoes_historico) = 0);
select teste.ok('Q10t gabarito continua A depois das tentativas da Ana', (public.r2a_revelar(array['R2A-S1-0001']) -> 'R2A-S1-0001' ->> 'correta') = 'A');
-- resposta da Ana na versão 3; o conteúdo muda (versão 4) e o gabarito é corrigido
-- com recorreção: só a versão em vigor é recorrigida, a resposta da versão 3 fica fora
select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"B","modo":"cronometrado","origem":"banco","sessao_id":"blk-10","posicao":0}]'::jsonb, false);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
update public.questoes set dados = jsonb_set(dados, '{vinheta}', '"A 54-year-old man has crushing chest pain for 5 days."') where id = 'R2A-S1-0001';
select (public.r2a_admin_editar_gabarito('R2A-S1-0001', 'B', 'Teste de recorreção restrita à versão em vigor', true)) as gab10w \gset
select teste.ok('Q10w recorreção não leva respostas de uma versão de conteúdo anterior',
  (:'gab10w'::jsonb ->> 'versao')::int = 5 and (:'gab10w'::jsonb ->> 'recorrigidas')::int = 0
  and exists (select 1 from public.respostas_item where questao_id = 'R2A-S1-0001' and resposta = 'B' and versao_item = 3 and not correta));
select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'A', 'Volta ao gabarito A depois do teste Q10w', false) as gab10w2 \gset
reset role;
set role anon;
select teste.bloqueia('Q10u anon lê o histórico', 'select * from public.questoes_historico');
select teste.bloqueia('Q10v anon chama a correção de gabarito', $q$select public.r2a_admin_editar_gabarito('R2A-S1-0001', 'B', 'Tentativa anônima', true)$q$);
reset role;

-- ===== Q11 gabarito no servidor e formulários fixos
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
select teste.ok('Q11a espelho acompanha a tabela (gabarito corrigido e versão)', (select p.versao = q.versao and p.status = q.status from public.questoes q join public.questoes_publicas p using (id) where q.id = 'R2A-S1-0001'));
select teste.passa('Q11b admin grava formulário fixo', $q$insert into public.formularios_fixos (step, codigo, nome, blocos) values ('step1', 'S1-A', 'Formulário A', '[["R2A-S1-0001"]]')$q$);
select teste.ok('Q11c admin recebe a revelação de qualquer item', public.r2a_revelar(array['R2A-S1-0002']) ? 'R2A-S1-0002');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
select teste.ok('Q11d Ana lê o formulário fixo (sem gabarito)', (select count(*) from public.formularios_fixos) = 1);
select teste.bloqueia('Q11e Ana grava formulário fixo', $q$insert into public.formularios_fixos (step, codigo, nome, blocos) values ('step1', 'S1-B', 'x', '[["R2A-S1-0001"]]')$q$);
select teste.bloqueia('Q11f Ana altera formulário fixo', $q$update public.formularios_fixos set blocos = '[["R2A-S1-0002"]]'$q$);
select teste.ok('Q11g Ana não executa as funções internas do espelho', not has_function_privilege('authenticated', 'public.r2a_parte_privada(jsonb, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.r2a_em_simulado_aberto(uuid, text)', 'execute'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'bia', false);
select teste.ok('Q11h Bia (inativa) não lê formulários fixos', (select count(*) from public.formularios_fixos) = 0);
reset role;
set role anon;
select teste.bloqueia('Q11i anon chama a função de responder', $q$select public.r2a_responder('[{"questao_id":"R2A-S1-0001","resposta":"A"}]')$q$);
select teste.bloqueia('Q11j anon pede a revelação', $q$select public.r2a_revelar(array['R2A-S1-0001'])$q$);
select teste.bloqueia('Q11k anon corrige simulado', $q$select public.r2a_corrigir_simulado(gen_random_uuid())$q$);
select teste.bloqueia('Q11l anon lê o espelho público', 'select * from public.questoes_publicas');
select teste.bloqueia('Q11m anon lê formulários fixos', 'select * from public.formularios_fixos');
reset role;

-- ===== A1 a A9: painel Angoff (juízes designados, rodadas, feedback, Hofstee e publicação)
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','m1@x.com','{"nome":"Mentor 1"}'),
 ('00000000-0000-0000-0000-0000000000d2','m2@x.com','{"nome":"Mentor 2"}'),
 ('00000000-0000-0000-0000-0000000000d3','m3@x.com','{"nome":"Mentor 3"}'),
 ('00000000-0000-0000-0000-0000000000d4','m4@x.com','{"nome":"Mentor 4"}'),
 ('00000000-0000-0000-0000-0000000000d5','m5@x.com','{"nome":"Mentor 5"}'),
 ('00000000-0000-0000-0000-0000000000d6','m6@x.com','{"nome":"Mentor 6"}'),
 ('00000000-0000-0000-0000-0000000000d7','m7@x.com','{"nome":"Mentor 7"}'),
 ('00000000-0000-0000-0000-0000000000d8','m8@x.com','{"nome":"Mentor 8"}'),
 ('00000000-0000-0000-0000-0000000000d9','m9@x.com','{"nome":"Mentor 9"}'),
 ('00000000-0000-0000-0000-0000000000da','m0@x.com','{"nome":"Mentor 10"}');
\set m1 '00000000-0000-0000-0000-0000000000d1'
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- A1 admin cria o painel e designa os juízes'
insert into public.angoff_paineis (step, nome, itens, rodadas_max, estado, rodada) values ('step1', 'Painel de teste', array['R2A-S1-0001'], 2, 'encerrado', 2) returning id as pa1, estado = 'avaliacao' and rodada = 1 as pa_ok \gset
select teste.ok('A1a painel nasce na rodada 1, em avaliação (estado forjado ignorado)', :'pa_ok'::boolean);
select teste.bloqueia('A1b painel com item fora do banco', $q$insert into public.angoff_paineis (step, nome, itens) values ('step1', 'Painel ruim', array['R2A-S1-9999'])$q$);
select teste.passa('A1c admin designa 10 mentores', format($q$insert into public.angoff_juizes (painel_id, juiz_id) select %L, ('00000000-0000-0000-0000-0000000000d' || k)::uuid from unnest(array['1','2','3','4','5','6','7','8','9','a']) k$q$, :'pa1'));
select teste.ok('A1d nome do juiz vem do perfil', (select bool_and(nome like 'Mentor %') and count(*) = 10 from public.angoff_juizes where painel_id = :'pa1'));
select teste.bloqueia('A1e aluno com matrícula ativa não pode ser juiz', format('insert into public.angoff_juizes (painel_id, juiz_id) values (%L, %L)', :'pa1', :'ana'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
\echo '--- A2 Ana (aluna) e Bia fora do painel'
select teste.ok('A2a Ana não vê o painel', (select count(*) from public.angoff_paineis) = 0);
select teste.bloqueia('A2b Ana pede os itens do painel', format('select public.r2a_angoff_itens(%L)', :'pa1'));
select teste.bloqueia('A2c Ana avalia', format('select public.r2a_angoff_avaliar(%L, %L, 50)', :'pa1', 'R2A-S1-0001'));
select teste.bloqueia('A2d Ana conduz o painel', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'fechar_rodada'));
select teste.bloqueia('A2e Ana se designa juíza', format('insert into public.angoff_juizes (painel_id, juiz_id) values (%L, %L)', :'pa1', :'ana'));
select teste.bloqueia('A2f Ana comenta na discussão', format($q$insert into public.angoff_discussao (painel_id, texto) values (%L, 'oi')$q$, :'pa1'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'m1', false);
\echo '--- A3 juiz 1'
select teste.ok('A3a o juiz vê o painel em que foi designado', (select count(*) from public.angoff_paineis) = 1);
select teste.ok('A3b o juiz não lê a tabela de questões nem o espelho de aluno', (select count(*) from public.questoes) = 0 and (select count(*) from public.questoes_publicas) = 0);
select teste.ok('A3c itens do painel chegam completos e sem gabarito', (select jsonb_array_length(x) = 1 and not ((x -> 0 -> 'dados') ?| array['correta','explicacao','explicacoes_alternativas']) and (x -> 0 -> 'dados' ->> 'vinheta') like 'A 54%' from (select public.r2a_angoff_itens(:'pa1') as x) t));
select teste.ok('A3d sem avaliar, nada de gabarito', public.r2a_angoff_revelar(:'pa1') = '{}'::jsonb);
select teste.bloqueia('A3e juiz grava estimativa direto na tabela', format($q$insert into public.angoff_avaliacoes (painel_id, juiz_id, questao_id, rodada, valor) values (%L, %L, 'R2A-S1-0001', 1, 50)$q$, :'pa1', :'m1'));
select teste.bloqueia('A3f estimativa fora de 0 a 100', format('select public.r2a_angoff_avaliar(%L, %L, 101)', :'pa1', 'R2A-S1-0001'));
select public.r2a_angoff_avaliar(:'pa1', 'R2A-S1-0001', 60, 'item direto') as av1 \gset
select teste.ok('A3g estimativa registrada e só então o gabarito e a explicação', (:'av1'::jsonb ->> 'valor')::int = 60 and (:'av1'::jsonb -> 'revelado' ->> 'correta') = 'A' and (:'av1'::jsonb -> 'revelado' ? 'explicacao'));
select teste.ok('A3h depois de avaliar, o juiz revê o gabarito', public.r2a_angoff_revelar(:'pa1') ? 'R2A-S1-0001');
select teste.ok('A3i feedback ainda vazio com a rodada aberta', (public.r2a_angoff_feedback(:'pa1') ->> 'rodadas_fechadas')::int = 0 and jsonb_array_length(public.r2a_angoff_feedback(:'pa1') -> 'estimativas') = 0);
select teste.bloqueia('A3j juiz conduz o painel', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'fechar_rodada'));
select teste.passa('A3k juiz responde o Hofstee', format('insert into public.angoff_hofstee (painel_id, juiz_id, k_min, k_max, f_min, f_max) values (%L, %L, 55, 70, 5, 20)', :'pa1', :'adm'));
select teste.ok('A3l o Hofstee fica no nome do juiz (dono forjado ignorado)', (select juiz_id = auth.uid() from public.angoff_hofstee where painel_id = :'pa1'));
select teste.bloqueia('A3m Hofstee com janela invertida', format('update public.angoff_hofstee set k_min = 80 where painel_id = %L', :'pa1'));
reset role;
-- os outros quatro juízes avaliam
do $$
declare j text; v int := 50;
begin
  for j in select id::text from auth.users where email in ('m2@x.com','m3@x.com','m4@x.com','m5@x.com') order by email loop
    perform set_config('request.jwt.claim.sub', j, true);
    perform public.r2a_angoff_avaliar((select id from public.angoff_paineis where nome = 'Painel de teste'), 'R2A-S1-0001', v, '');
    v := v + 5;
  end loop;
end $$;
set role authenticated; select set_config('request.jwt.claim.sub', :'m1', false);
select teste.ok('A4a o juiz lê só as próprias estimativas', (select count(*) from public.angoff_avaliacoes) = 1);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- A5 admin fecha a rodada 1'
select teste.ok('A5a admin lê as 5 estimativas', (select count(*) from public.angoff_avaliacoes where painel_id = :'pa1') = 5);
select teste.passa('A5b admin fecha a rodada', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'fechar_rodada'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'m1', false);
select public.r2a_angoff_feedback(:'pa1') as fb1 \gset
select teste.ok('A6a feedback da rodada fechada: 5 estimativas, média 58 (60, 50, 55, 60, 65), histograma e p observado',
  (:'fb1'::jsonb -> 'estimativas' -> 0 ->> 'n')::int = 5 and (:'fb1'::jsonb -> 'estimativas' -> 0 ->> 'media')::numeric = 58
  and jsonb_array_length(:'fb1'::jsonb -> 'estimativas' -> 0 -> 'histograma') = 10 and (:'fb1'::jsonb -> 'p_observado') ? 'R2A-S1-0001');
select teste.bloqueia('A6b avaliar com a rodada fechada', format('select public.r2a_angoff_avaliar(%L, %L, 70)', :'pa1', 'R2A-S1-0001'));
select teste.passa('A6c juiz comenta na discussão', format($q$insert into public.angoff_discussao (painel_id, questao_id, texto, autor_nome) values (%L, 'R2A-S1-0001', 'O distrator B é forte para o limítrofe.', 'Outro nome')$q$, :'pa1'));
select teste.ok('A6d comentário com o nome e a rodada certos', (select autor_nome = 'Mentor 1' and rodada = 1 and autor_id = auth.uid() from public.angoff_discussao where painel_id = :'pa1'));
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'ana', false);
select teste.ok('A6e Ana não lê a discussão', (select count(*) from public.angoff_discussao) = 0);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
\echo '--- A7 rodada 2, encerramento e publicação'
select teste.passa('A7a admin abre a rodada 2', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'abrir_rodada'));
reset role;
do $$
declare j text; v int := 60;
begin
  for j in select id::text from auth.users where email like 'm_@x.com' order by email loop
    perform set_config('request.jwt.claim.sub', j, true);
    perform public.r2a_angoff_avaliar((select id from public.angoff_paineis where nome = 'Painel de teste'), 'R2A-S1-0001', v, '');
    v := v + 1;
  end loop;
end $$;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
select teste.bloqueia('A7b abrir rodada além do máximo', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'abrir_rodada'));
select teste.bloqueia('A7c publicar antes de encerrar', format('select public.r2a_admin_publicar_angoff(%L)', :'pa1'));
select teste.passa('A7d admin encerra o painel', format('select public.r2a_admin_angoff_avancar(%L, %L)', :'pa1', 'encerrar'));
select teste.bloqueia('A7e publicar com menos de 10 juízes por item', format('select public.r2a_admin_publicar_angoff(%L, 9)', :'pa1'));
-- Hofstee obrigatório: sem resposta ou com o corte fora da janela, só com justificativa
reset role;
create temp table hof_guardado as select * from public.angoff_hofstee where painel_id = :'pa1';
delete from public.angoff_hofstee where painel_id = :'pa1';
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
select teste.bloqueia('A7e1 publicar sem nenhuma resposta de Hofstee e sem justificativa', format('select public.r2a_admin_publicar_angoff(%L)', :'pa1'));
select teste.bloqueia('A7e2 justificativa curta não basta', format('select public.r2a_admin_publicar_angoff(%L, 10, %L)', :'pa1', 'curta'));
select public.r2a_admin_publicar_angoff(:'pa1', 10, 'Painel de teste sem Hofstee: refazer com a turma seguinte.') as pubj \gset
select teste.ok('A7e3 com justificativa, publica e grava o motivo e a verificação', (:'pubj'::jsonb ->> 'hofstee_ok')::boolean = false
  and (select publicacao_justificativa like 'Painel de teste sem Hofstee%' and (publicacao_hofstee ->> 'ok')::boolean = false from public.angoff_paineis where id = :'pa1'));
reset role;
alter table public.angoff_hofstee disable trigger angoff_hofstee_guard;
insert into public.angoff_hofstee (painel_id, juiz_id, k_min, k_max, f_min, f_max) select painel_id, juiz_id, 70, 80, f_min, f_max from hof_guardado;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
select teste.bloqueia('A7e4 corte de 64,5% fora da janela de 70% a 80% dos juízes, sem justificativa', format('select public.r2a_admin_publicar_angoff(%L)', :'pa1'));
reset role;
update public.angoff_hofstee h set k_min = g.k_min, k_max = g.k_max from hof_guardado g where h.painel_id = g.painel_id and h.juiz_id = g.juiz_id;
alter table public.angoff_hofstee enable trigger angoff_hofstee_guard;
set role authenticated; select set_config('request.jwt.claim.sub', :'adm', false);
select public.r2a_admin_publicar_angoff(:'pa1') as pub1 \gset
select teste.ok('A7e5 com o corte dentro da janela, publica sem justificativa e limpa a anterior', (:'pub1'::jsonb ->> 'hofstee_ok')::boolean
  and (select publicacao_justificativa is null and (publicacao_hofstee ->> 'ok')::boolean from public.angoff_paineis where id = :'pa1'));
select teste.ok('A7f publicação: o item com 10 juízes recebe o Angoff da rodada final (média 64,5), com erro-padrão do item e do corte abaixo de 0,02',
  (:'pub1'::jsonb ->> 'publicados')::int = 1 and (:'pub1'::jsonb ->> 'corte_ep')::numeric < 0.02
  and (select angoff_painel = 0.645 and angoff_painel_juizes = 10 and angoff_painel_ep between 0.009 and 0.0097 and angoff_painel_id = :'pa1'::uuid from public.questoes where id = 'R2A-S1-0001'));
select teste.ok('A7g o espelho do aluno recebe o Angoff do painel', (select angoff_painel = 0.645 and angoff_painel_juizes = 10 and angoff_painel_ep is not null from public.questoes_publicas where id = 'R2A-S1-0001'));
select teste.bloqueia('A7h juiz avalia painel encerrado', format('select public.r2a_angoff_avaliar(%L, %L, 70)', :'pa1', 'R2A-S1-0001'));
update public.questoes set dados = jsonb_set(dados, '{vinheta}', '"A 54-year-old man has crushing chest pain for 6 days."') where id = 'R2A-S1-0001';
select teste.ok('A7i conteúdo novo apaga o Angoff do painel (valia para o conteúdo antigo)', (select angoff_painel is null and angoff_painel_juizes is null and angoff_painel_ep is null from public.questoes where id = 'R2A-S1-0001'));
reset role;
set role anon;
select teste.bloqueia('A8a anon lê painéis', 'select * from public.angoff_paineis');
select teste.bloqueia('A8b anon pede itens do painel', format('select public.r2a_angoff_itens(%L)', :'pa1'));
select teste.bloqueia('A8c anon publica', format('select public.r2a_admin_publicar_angoff(%L)', :'pa1'));
reset role;

-- verificações que não podem ter ficado de fora por erro no meio da instrução
select teste.ok('Z1 todas as verificações do gabarito no servidor e do painel Angoff rodaram',
  (select count(distinct split_part(nome, ' ', 1)) from teste.resultado where split_part(nome, ' ', 1) = any (array['Q4a2','Q4f3','Q4g','Q4g2','Q4h','Q4h2','Q4k','Q4m3','Q4s3','Q4s4','Q11a','Q11c','Q11d','Q11g','Q11h','A1a','A1d','A3a','A3b','A3c','A3d','A3g','A3h','A3i','A3l','A4a','A5a','A6a','A6d','A6e','A7f','A7g','A7i'])) = 33);

\echo '=== RESUMO DA PLATAFORMA (falhas precisa ser 0)'
select count(*) filter (where not ok) as falhas, count(*) as verificacoes from teste.resultado;
select nome, detalhe from teste.resultado where not ok;
