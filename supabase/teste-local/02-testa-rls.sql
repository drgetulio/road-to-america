-- Teste das políticas RLS e dos gatilhos com três usuários (admin, Ana e Bia).
-- Cada bloco "deve falhar" precisa terminar em ERROR ou em 0 linhas afetadas.
\set ON_ERROR_STOP 0
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.com'),
 ('00000000-0000-0000-0000-00000000000b','ana@x.com'),
 ('00000000-0000-0000-0000-00000000000c','bia@x.com');
select id, email, papel from public.profiles order by email;
-- promoção do primeiro admin (dono do banco, auth.uid() nulo)
update public.profiles set papel='admin' where email='admin@x.com';

-- ===== como ANA (participante)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo '--- T1 escalada de papel (deve falhar)'
update public.profiles set papel='admin' where id=auth.uid();
\echo '--- T2 card pessoal (status vira rascunho, autor = ana)'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho,status) values ('p1','basico','Q?','A','cardiovascular','farmacologia','pessoal','aprovado') returning id,status,autor_id,versao;
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho) values ('p1b','basico','Q?','A','cardiovascular','farmacologia','pessoal') returning id,status,autor_id;
\echo '--- T3 enviar à comunidade (em_revisao)'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho) values ('c1','basico','Q2?','A2','cardiovascular','farmacologia','comunidade') returning id,status; -- sem status explícito: rascunho
update public.cards set status='em_revisao' where id='c1' returning id,status;
\echo '--- T4 criar oficial (deve falhar)'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho) values ('o-x','basico','Q?','A','cardiovascular','farmacologia','oficial');
\echo '--- T5 aprovar o próprio (deve falhar)'
update public.cards set status='aprovado' where id='c1';
\echo '--- T6 forjar autor (autor vira ana)'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho,autor_id) values ('p2','basico','Q3?','A3','cardiovascular','farmacologia','pessoal','00000000-0000-0000-0000-00000000000c') returning id, autor_id;
reset role;

-- ===== como ADMIN
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo '--- T7 admin cria oficial e aprova c1'
insert into public.cards (id,tipo,frente,verso,sistema,disciplina,baralho,status,origem) values ('r2a-cardiovascular-001','basico','Oficial?','Sim','cardiovascular','fisiologia','oficial','aprovado','seed') returning id,status,autor_id is not null as tem_autor;
update public.cards set status='aprovado', revisor_id=auth.uid(), comentario_revisao='ok' where id='c1' returning id,status,versao;
select count(*) as admin_ve_todos from public.cards;
reset role;

-- ===== como BIA (outra participante)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
\echo '--- T8 bia vê oficial + c1 aprovado, nao vê pessoais da ana (esperado: c1 e o oficial)'
select id from public.cards order by id;
\echo '--- T9 bia edita card da ana / oficial (0 linhas)'
update public.cards set frente='hack' where id='c1';
update public.cards set frente='hack' where id='r2a-cardiovascular-001';
delete from public.cards where id='r2a-cardiovascular-001';
\echo '--- T10 bia estado SRS próprio ok; de outra pessoa falha'
insert into public.srs_estado (card_id, ord, due, state) values ('c1',1,now(),2) returning user_id;
insert into public.srs_estado (user_id, card_id, ord, due, state) values ('00000000-0000-0000-0000-00000000000b','c1',1,now(),2);
insert into public.revlog (card_id, ord, rating, state) values ('c1',1,3,2) returning user_id;
\echo '--- T11 sinalização (status forçado aberta) e não resolve'
insert into public.sinalizacoes (card_id, motivo, texto, status) values ('c1','erro_factual','dose errada','resolvida') returning status;
update public.sinalizacoes set status='resolvida';
\echo '--- T11b sinalizar card invisível (pessoal da ana) falha'
insert into public.sinalizacoes (card_id, motivo) values ('p1','outro');
reset role;

-- ===== ANA edita c1 aprovado: volta para em_revisao e versao+1
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo '--- T12 ana edita c1 aprovado -> em_revisao, versao 2'
update public.cards set verso='A2 corrigida' where id='c1' returning status, versao;
\echo '--- T14 ana não vê srs da bia'
select count(*) as srs_visiveis from public.srs_estado;
select count(*) as sinalizacoes_visiveis from public.sinalizacoes;
\echo '--- T15 historico visivel para ana (cards dela)'
select card_id, versao, acao from public.card_historico order by id;
\echo '--- T16 ana apaga pessoal ok, oficial nao'
delete from public.cards where id='p1b' returning id;
reset role;

-- ===== ADMIN promove c1 a oficial e resolve sinalização
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
update public.cards set status='aprovado' where id='c1';
update public.cards set baralho='oficial' where id='c1' returning baralho, status;
update public.sinalizacoes set status='resolvida', resposta='corrigido' returning status;
select card_id, versao, acao from public.card_historico where card_id='c1' order by id;
reset role;
\echo '--- T17 anon não lê nada'
set role anon; select count(*) from public.cards; reset role;
