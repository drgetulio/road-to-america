#!/usr/bin/env python3
"""Planilha de produção da Questão de Embarque a partir de instagram/programa-365.json.

    python3 instagram/ferramentas/gerar-planilha.py

Saída: entregas/instagram-365-dias.xlsx com as abas Calendário, Prompts das imagens,
Personagens, Reels semanais, Automação de DM, Rotina semanal e Como usar.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parents[2]
PROG = json.loads((RAIZ / 'instagram' / 'programa-365.json').read_text(encoding='utf8'))
SAIDA = RAIZ / 'entregas' / 'instagram-365-dias.xlsx'

NAVY, VERMELHO, PAPEL, VERDE, AMARELO = '0F2747', 'B0243A', 'F3F5F2', '1D8A4B', 'F1C232'
F = 'Arial'
fonte = Font(name=F, size=10)
cab_font = Font(name=F, size=10, bold=True, color='FFFFFF')
cab_fill = PatternFill('solid', fgColor=NAVY)
status_fill = PatternFill('solid', fgColor='FFF6D6')
remix_fill = PatternFill('solid', fgColor='E7EBE6')
acolhe_fill = PatternFill('solid', fgColor='E6EEF8')
fino = Side(style='thin', color='D0D6D0')
borda = Border(left=fino, right=fino, top=fino, bottom=fino)
quebra = Alignment(wrap_text=True, vertical='top')
MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

STATUS_IMG = ['Pendente', 'Gerada', 'Aprovada', 'Refazer']
STATUS_RENDER = ['Pendente', 'Renderizado', 'Conferido']
STATUS_POST = ['Pendente', 'Agendado', 'Postado', 'Adiado']
STATUS_REV = ['Pendente', 'Revisado', 'Ajustar']


def data_br(iso):
    a, m, d = iso.split('-')
    return f'{d}/{m}/{a}'


def cabecalho(ws, colunas, linha=1):
    for i, (nome, larg) in enumerate(colunas, start=1):
        c = ws.cell(row=linha, column=i, value=nome)
        c.font = cab_font
        c.fill = cab_fill
        c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
        c.border = borda
        ws.column_dimensions[get_column_letter(i)].width = larg
    ws.row_dimensions[linha].height = 42


def escrever(ws, linha, valores, fill=None):
    for i, v in enumerate(valores, start=1):
        c = ws.cell(row=linha, column=i, value=v)
        c.font = fonte
        c.alignment = quebra
        c.border = borda
        if fill:
            c.fill = fill


def validacao(ws, opcoes, col, ini, fim):
    dv = DataValidation(type='list', formula1='"' + ','.join(opcoes) + '"', allow_blank=True)
    dv.error = 'Escolha um dos valores da lista.'
    dv.prompt = ' / '.join(opcoes)
    ws.add_data_validation(dv)
    dv.add(f'{col}{ini}:{col}{fim}')


def letra(n):
    return get_column_letter(n)


wb = Workbook()

# ------------------------------------------------------------------ Calendário
ws = wb.active
ws.title = 'Calendário'
COLS = [
    ('Dia', 6), ('Data (D)', 11), ('Dia da semana', 12), ('Mês', 8), ('Quadro', 16), ('Step', 9), ('Sistema', 22), ('Área', 18),
    ('Tópico', 26), ('Conceito (inglês)', 34), ('Tipo de pergunta', 13), ('Personagem', 14), ('Gancho de data', 26), ('Remix de (dias)', 11),
    ('Tom', 11), ('CTA do dia', 12), ('Palavra-chave', 12), ('Frase do CTA (legenda, sem endereço)', 40), ('Desafio', 14), ('Live', 12), ('Gancho (capa)', 34), ('Gancho de apoio', 28), ('Vinheta (inglês)', 60), ('Pergunta', 30),
    ('A', 24), ('B', 24), ('C', 24), ('D', 24), ('Correta', 8), ('Resposta certa', 28), ('Por que a certa está certa', 60),
    ('Por que as erradas estão erradas', 60), ('Termos da resposta (só em D+1)', 30), ('Macete', 40), ('Pegadinha de prova', 40),
    ('Palavras-chave neutras (legenda D)', 30), ('Legenda D (só a questão)', 60), ('Legenda do post de D (questão D + gabarito D-1, pronta para colar)', 70),
    ('Legenda D+1 (gabarito e explicação, comentário fixado)', 70), ('Explicação sai em (D+1)', 11), ('Enquete (D): pergunta', 18), ('Quiz do D+1 e Reel: pergunta com o achado', 34),
    ('Enquete (D) e quiz (D+1): opção A', 16), ('Opção B', 16), ('Opção C', 16), ('Opção D', 16), ('Letra certa (só no quiz do D+1)', 10),
    ('Roteiro dos stories', 60), ('Imagem da questão (arquivo)', 26), ('Imagem da explicação (arquivo)', 28), ('Fonte', 40),
    ('Revisão médica', 50), ('Revisão de humor e compliance', 50),
    ('Status imagem questão', 13), ('Status imagem explicação', 13), ('Status render', 13), ('Revisão final (fontes)', 13),
    ('Status feed (D)', 12), ('Status enquete (D)', 12), ('Status quiz do gabarito (D+1)', 12), ('Postado em', 11), ('Alcance', 10),
    ('Salvamentos', 10), ('Taxa de salvamento', 10), ('Votos na enquete', 10), ('Respostas no quiz', 10), ('Acerto no quiz (%)', 10), ('Comentários com a palavra', 11), ('Observações', 30),
]
cabecalho(ws, COLS)
idx = {nome: i + 1 for i, (nome, _) in enumerate(COLS)}
N = len(PROG['dias'])
for r, d in enumerate(PROG['dias'], start=2):
    q, ex, lg, st, im = d['questao'], d['explicacao'], d['legendas'], d['story'], d['imagens']
    alts = {a['letra']: a for a in q['alternativas']}
    altx = lambda l: alts[l]['texto'] + (f" (visto no dia {alts[l]['visto_no_dia']})" if alts[l]['visto_no_dia'] else '')
    erradas = '\n'.join(f'{k}) {v}' for k, v in ex['erradas'].items())
    rev = d['revisao'] or {}
    mes = d['data'][5:7]
    vals = [
        d['dia'], data_br(d['data']), d['dia_semana'], f"{MESES[int(mes) - 1]}/{d['data'][2:4]}", d['quadro'], d['step'], d['sistema'], d['area'],
        d['topico'], d['conceito'], d['tipo_pergunta'], d['personagem'] or '', d['gancho_data'] or '',
        ', '.join(map(str, d['remix_de'])) if d['remix_de'] else '', d['tom'], d['cta'], d['cta_palavra'] or '', d['cta_texto'],
        (f"edição {d['desafio']['edicao']}: " + (f"dia {d['desafio']['dia_do_desafio']} de 30" if d['desafio']['dia_do_desafio'] else 'inscrição')) if d['desafio'] else '',
        d['live'] or '', d['gancho'], d['gancho_apoio'] or '',
        q['vinheta'], q['pergunta'], altx('A'), altx('B'), altx('C'), altx('D'), q['correta'], q['resposta'], ex['certa'], erradas,
        ', '.join(ex['termos']), ex['macete'] + (f"\n{ex['macete_apoio']}" if ex['macete_apoio'] else ''), ex['pegadinha'] or '',
        ', '.join(lg['palavras_chave']), lg['questao_D'], lg['post_D'], lg['explicacao_D1'], data_br(d['explicacao_em']), st['pergunta'], st.get('pergunta_d1_e_reel') or '',
        *st['opcoes'], st['correta'], st['roteiro'], im['questao']['arquivo'], im['explicacao']['arquivo'], d['fonte'],
        (rev.get('medica', '') + (f"\n{rev['letras']}" if rev.get('letras') else '')).strip(), rev.get('humor_compliance', ''),
        'Pendente', 'Pendente', 'Pendente', 'Pendente', 'Pendente', 'Pendente', 'Pendente', None, None, None, None, None, None, None, None, '',
    ]
    fill = remix_fill if d['remix_de'] else acolhe_fill if d['tom'] == 'acolhedor' else None
    escrever(ws, r, vals, fill)
    ws.row_dimensions[r].height = 96
    # taxa de salvamento = salvamentos / alcance
    a, s = letra(idx['Alcance']), letra(idx['Salvamentos'])
    c = ws.cell(row=r, column=idx['Taxa de salvamento'], value=f'=IF(AND(ISNUMBER({a}{r}),{a}{r}>0,ISNUMBER({s}{r})),{s}{r}/{a}{r},"")')
    c.number_format = '0.0%'
    ws.cell(row=r, column=idx['Postado em']).number_format = 'DD/MM/YYYY'
    for nome in ['Status imagem questão', 'Status imagem explicação', 'Status render', 'Revisão final (fontes)', 'Status feed (D)', 'Status enquete (D)', 'Status quiz do gabarito (D+1)', 'Postado em', 'Alcance', 'Salvamentos', 'Votos na enquete', 'Respostas no quiz', 'Acerto no quiz (%)', 'Comentários com a palavra', 'Observações']:
        ws.cell(row=r, column=idx[nome]).fill = status_fill
    ws.cell(row=r, column=idx['Correta']).font = Font(name=F, size=11, bold=True, color=VERMELHO)
    ws.cell(row=r, column=idx['Correta']).alignment = Alignment(horizontal='center', vertical='top')
ult = N + 1
for nome in ['Status imagem questão', 'Status imagem explicação']:
    validacao(ws, STATUS_IMG, letra(idx[nome]), 2, ult)
validacao(ws, STATUS_RENDER, letra(idx['Status render']), 2, ult)
validacao(ws, STATUS_REV, letra(idx['Revisão final (fontes)']), 2, ult)
for nome in ['Status feed (D)', 'Status enquete (D)', 'Status quiz do gabarito (D+1)']:
    validacao(ws, STATUS_POST, letra(idx[nome]), 2, ult)
ws.freeze_panes = 'C2'
ws.auto_filter.ref = f'A1:{letra(len(COLS))}{ult}'

# ------------------------------------------------------------------ Prompts das imagens
wp = wb.create_sheet('Prompts das imagens')
PCOLS = [('Dia', 6), ('Data de uso', 11), ('Tipo', 11), ('Quadro', 16), ('Personagem', 14), ('Prompt pronto para copiar (Higgsfield)', 90),
         ('Modelo', 16), ('Resolução', 9), ('Proporção', 9), ('Nome de arquivo esperado', 30), ('Cena em português', 50), ('Texto alternativo', 34),
         ('Referência do personagem (medias, role image_references)', 40), ('Status da geração', 13), ('Observações', 30)]
REFS = {p['nome']: p for p in ((PROG.get('referencias_personagens') or {}).get('personagens') or [])}
def ref_txt(nomes):
    if not nomes:
        return 'sem personagem fixo: gerar sem referência'
    return '\n'.join(f"{n}: {REFS.get(n, {}).get('arquivo', '')} (media_id: {REFS.get(n, {}).get('media_id') or 'preencher em personagens-referencia.json'})" for n in nomes)
cabecalho(wp, PCOLS)
r = 2
for d in PROG['dias']:
    for tipo, chave, quando in [('questão', 'questao', d['data']), ('explicação', 'explicacao', d['explicacao_em'])]:
        im = d['imagens'][chave]
        pr = d['imagens'].get('personagem_referencia') or {}
        escrever(wp, r, [d['dia'], data_br(quando), tipo, d['quadro'], d['personagem'] or '', im['prompt'], 'Nano Banana Pro', '2k', '4:5',
                         im['arquivo'], im['cena'], im['alt'] or '', ref_txt(pr.get('questao' if chave == 'questao' else 'macete') or []), 'Pendente', ''], remix_fill if tipo == 'explicação' else None)
        wp.cell(row=r, column=14).fill = status_fill
        wp.cell(row=r, column=15).fill = status_fill
        wp.row_dimensions[r].height = 150
        r += 1
validacao(wp, STATUS_IMG, 'N', 2, r - 1)
wp.freeze_panes = 'D2'
wp.auto_filter.ref = f'A1:{letra(len(PCOLS))}{r - 1}'

# ------------------------------------------------------------------ Personagens
wc = wb.create_sheet('Personagens')
CCOLS = [('Personagem', 18), ('Quem é', 40), ('Descrição visual fixa (português)', 50), ('Descrição fixa para o prompt (inglês)', 60),
         ('Prompt-base (acrescente a cena do dia)', 90), ('Bordão', 26), ('Onde aparece', 30), ('Dias em que é o personagem do dia', 18), ('Lista dos dias', 40),
         ('Folha de referência (arquivo)', 30), ('Prompt da folha de referência (Nano Banana Pro, 2k, 16:9)', 90), ('media_id da folha (Higgsfield)', 20), ('Imagens de questão e macete com o personagem', 14)]
cabecalho(wc, CCOLS)
r = 2
for p in PROG['personagens'] + PROG['apoio']:
    rf = REFS.get(p['nome'], {})
    escrever(wc, r, [p['nome'], p['quem'], p['pt'], p['descricao_en'], p['prompt_base'], p['bordao'] or '', p['onde'], len(p['dias']) or '',
                     ', '.join(map(str, p['dias'])), rf.get('arquivo', ''), rf.get('prompt_folha', ''), rf.get('media_id') or '', rf.get('dias_com_o_personagem', '')])
    wc.cell(row=r, column=12).fill = status_fill
    wc.row_dimensions[r].height = 170
    r += 1
wc.freeze_panes = 'B2'
wc.auto_filter.ref = f'A1:{letra(len(CCOLS))}{r - 1}'

# ------------------------------------------------------------------ Reels semanais
RS = PROG.get('reels_semanais') or {'reels': []}
wr = wb.create_sheet('Reels semanais')
RCOLS = [('Semana', 7), ('Publicar (sexta 19h)', 12), ('Formato', 16), ('Questão do dia', 8), ('Quadro', 16), ('Personagem', 14), ('Gabarito saiu em', 11),
         ('Duração (s)', 8), ('Gancho (0 a 2 s)', 34), ('Roteiro cena a cena (tempo, visual, texto na tela)', 80), ('Narração sugerida', 50), ('Palavra-chave', 11),
         ('Áudio sugerido (sem música embutida)', 50), ('Legenda do Reel (sem endereço)', 60), ('Resultado da enquete (preencher)', 26), ('Status', 14), ('Troque um dado (Pegadinha)', 40), ('Ilustrações do carrossel', 30),
         ('Vídeo', 28), ('Capa', 28), ('Alcance', 10), ('% não seguidores', 10), ('Retenção 3 s (%)', 10), ('Compartilhamentos', 10), ('Comentários com a palavra', 10), ('Observações', 30)]
cabecalho(wr, RCOLS)
r = 2
for x in RS['reels']:
    rot = '\n'.join(f"{c['inicio_s']:g} a {c['fim_s']:g} s · {c['tipo_visual']}{' (' + c['personagem'] + ')' if c.get('personagem') else ''}: {c['texto_tela'].replace('*', '')}" + (f" [{' / '.join(c['opcoes'])}]" if c.get('opcoes') else '') for c in x['cenas'])
    narr = '\n'.join(c.get('narracao', '') for c in x['cenas'])
    if x['formato'] == 'resultado':
        res = (f"A {x['resultado']['A']}% · B {x['resultado']['B']}% · C {x['resultado']['C']}% · D {x['resultado']['D']}% (erro {x['resultado']['erro']}%)" if x['status'] == 'pronto'
               else f"sem números: sai o plano B. Para as barras, preencha o dia {x['dia_questao']} em instagram/resultados-enquete.json e gere de novo")
    else:
        res = ''
    st_txt = {'pronto': 'Pronto para renderizar', 'pronto_plano_b': 'Pronto (plano B, sem números)'}.get(x['status'], x['status'])
    contr = f"{x['contraste']['dado']} -> {x['contraste']['resposta']}" if x.get('contraste') else ''
    il = x.get('ilustracoes') or {}
    ilt = (f"{il.get('questao')} e {il.get('macete')}: " + ('já existem, entram no Reel' if il.get('existem') else 'ainda não geradas (avatar no lugar)')) if il else ''
    escrever(wr, r, [x['semana'], data_br(x['publicar_em']), x['formato_nome'], x['dia_questao'] or '', x['quadro'] or '', x['personagem'] or '',
                     data_br(x['gabarito_publicado_em']) if x['gabarito_publicado_em'] else '', x['duracao_s'], x['gancho_0a2s'].replace('*', ''), rot, narr,
                     x['palavra_chave'], x['audio']['sugestao'], x['legenda'], res, st_txt, contr, ilt,
                     x['video'], x['capa'], None, None, None, None, None, ''], acolhe_fill if x['tom'] == 'acolhedor' else (status_fill if x['formato'] == 'resultado' else None))
    for col in range(21, 27):
        wr.cell(row=r, column=col).fill = status_fill
    wr.row_dimensions[r].height = 170
    r += 1
wr.freeze_panes = 'C2'
wr.auto_filter.ref = f'A1:{letra(len(RCOLS))}{max(2, r - 1)}'

# ------------------------------------------------------------------ Automação de DM
CV = PROG['conversao']
AD = CV['automacao_dm']
wd = wb.create_sheet('Automação de DM')
wd.column_dimensions['A'].width = 16
wd.column_dimensions['B'].width = 44
wd.column_dimensions['C'].width = 46
wd.column_dimensions['D'].width = 90
wd.column_dimensions['E'].width = 22
wd.column_dimensions['F'].width = 14
lin = [1]
def tit(t):
    c = wd.cell(row=lin[0], column=1, value=t); c.font = Font(name=F, size=12, bold=True, color=NAVY); lin[0] += 1
def cab(vals):
    for i, v in enumerate(vals, start=1):
        c = wd.cell(row=lin[0], column=i, value=v); c.font = cab_font; c.fill = cab_fill; c.alignment = Alignment(wrap_text=True, vertical='center')
    lin[0] += 1
def lin_(vals, h=None, fill=None):
    escrever(wd, lin[0], vals, fill)
    if h: wd.row_dimensions[lin[0]].height = h
    lin[0] += 1
tit('Automação de comentário para direct: uma palavra, uma resposta')
lin_(['Regra dos links', CV['regra_dos_links']], 45)
lin_(['Ferramenta', AD['ferramenta']['o_que_usar']], 45)
for t in AD['ferramenta']['configuracao']:
    lin_(['Configuração', t], 32)
for t in AD['ferramenta']['regras_da_meta']:
    lin_(['Regra da Meta', t], 32)
lin_(['Tempo', AD['ferramenta']['tempo']], 32)
lin_(['Aviso de privacidade (LGPD)', AD['aviso_privacidade']], 48)
lin[0] += 1
tit('Palavras-chave')
cab(['Palavra', 'O que entrega', 'Respostas públicas no comentário (sortear)', 'Mensagem no direct (copiar para a ferramenta)', 'Link com UTM', 'Dias com esse CTA'])
for w in AD['palavras']:
    lin_([w['palavra'], w['entrega'], '\n'.join(w['respostas_publicas']), w['dm'], w['link'] or '', w['dias_com_cta']], 230)
lin[0] += 1
tit('CTA por quadro (legenda e último slide do post)')
cab(['Quadro', 'CTA', 'Exceções'])
exc = 'Primeira quarta do mês: FACULDADE. Semana de inscrição do desafio: DESAFIO. Dia da live e sábado antes: LIVE. MACETE a partir da sexta do dia 5.'
for q, t in CV['cta_por_quadro'].items():
    lin_([q, t, exc], 30)
lin[0] += 1
tit('MACETE: texto do pacote dos sete macetes mais recentes (trocar toda sexta às 12h, antes do Reel das 19h)')
cab(['Pacote', 'Dias', 'Ativo de (sexta, 12h)', 'Mensagem no direct', 'Até (sexta seguinte, 12h)', ''])
for w in AD['macete_por_semana']:
    lin_([w['semana'], f"{w['dias'][0]} a {w['dias'][1]}", data_br(w['ativo_de']) if w['ativo_de'] else '', w['dm'], data_br(w['ativo_ate']) if w['ativo_ate'] else '', ''], 230)
lin[0] += 1
tit('DESAFIO: texto por edição')
cab(['Edição', 'Inscrição', 'Desafio', 'Mensagem no direct', 'Live de encerramento', ''])
for e, w in zip(CV['desafio']['edicoes'], AD['desafio_por_edicao']):
    lin_([e['edicao'], f"{data_br(e['inscricao'][0])} a {data_br(e['inscricao'][1])}", f"{data_br(e['inicio'])} a {data_br(e['fim'])} (dias {e['dia_inicio']} a {e['dia_fim']})", w['dm'], data_br(e['live_de_encerramento']), ''], 300)
lin_(['Sem prêmio', CV['desafio']['por_que_sem_premio']], 45)
lin[0] += 1
tit('LIVE de Correção: datas e texto')
cab(['Data', 'Horário', 'Duração', 'Mensagem no direct', 'Espectadores', 'Observações'])
for w in AD['live_por_data']:
    lin_([data_br(w['data']), CV['lives']['horario'], f"{CV['lives']['duracao_min']} min", w['dm'], None, ''], 150)
    wd.cell(row=lin[0] - 1, column=5).fill = status_fill
lin_(['Regra da data', CV['lives']['regra_da_data']], 45)
for t in CV['lives']['roteiro']:
    lin_(['Roteiro', t], 30)
for t in CV['lives']['preparo']:
    lin_(['Preparo', t], 30)

# ------------------------------------------------------------------ Rotina semanal
RT = PROG['rotina']
wt = wb.create_sheet('Rotina semanal')
TCOLS = [('Dia', 14), ('Modo completo (8 slides, 4 stories, 14 imagens por semana)', 70), ('Modo enxuto (6 slides, 2 stories, 7 imagens por semana)', 60), ('Feito nesta semana?', 14)]
cabecalho(wt, TCOLS)
r = 2
for x in RT['semana']:
    escrever(wt, r, [x['dia'], '\n'.join(x['completo']), '\n'.join(x['enxuto']), ''], status_fill if x['dia'] == RT['dia_do_lote'] else None)
    wt.row_dimensions[r].height = 140 if x['dia'] == RT['dia_do_lote'] else 70
    r += 1
r += 1
for i, v in enumerate(['Horas por semana', 'Completo', 'Enxuto'], start=1):
    c = wt.cell(row=r, column=i, value=v); c.font = cab_font; c.fill = cab_fill
r += 1
H = RT['horas']
for rot_, k in [('Lote de quarta (min)', 'lote_min'), ('Stories e comentários (min)', 'diario_min'), ('Métricas, Reel e placar (min)', 'semanal_fixo_min'), ('Live mensal, por semana (min)', 'live_min_por_semana'), ('Total (min)', 'total_min'), ('Total', 'total_texto'), ('Imagens por semana', 'imagens_por_semana'), ('Slides por post', 'slides_por_post'), ('Stories por dia', 'stories_por_dia'), ('Como a conta foi feita', 'conta')]:
    escrever(wt, r, [rot_, H['completo'][k], H['enxuto'][k]])
    if k == 'conta':
        wt.row_dimensions[r].height = 70
    r += 1
r += 1
if H.get('implantacao_texto'):
    escrever(wt, r, ['Implantação (uma vez)', H['implantacao_texto']]); wt.row_dimensions[r].height = 60; r += 1
if H.get('primeiras_semanas'):
    escrever(wt, r, ['Primeiras semanas', H['primeiras_semanas']]); wt.row_dimensions[r].height = 40; r += 1
escrever(wt, r, ['Antecedência', RT['antecedencia']]); r += 1
escrever(wt, r, ['Quando usar o enxuto', RT['quando_usar_o_enxuto']]); wt.row_dimensions[r].height = 45; r += 1
escrever(wt, r, ['Carrossel', PROG['carrossel']['escolha'] + ' Completo: ' + ' / '.join(PROG['carrossel']['completo']) + '. Enxuto: ' + ' / '.join(PROG['carrossel']['enxuto']) + '.']); wt.row_dimensions[r].height = 90; r += 1
escrever(wt, r, ['Stories', PROG['stories']['por_que']]); wt.row_dimensions[r].height = 60; r += 1
wt.freeze_panes = 'B2'

# ------------------------------------------------------------------ Como usar
wu = wb.create_sheet('Como usar')
wu.column_dimensions['A'].width = 34
wu.column_dimensions['B'].width = 70
wu.column_dimensions['C'].width = 26
wu.column_dimensions['D'].width = 50
titulo = Font(name=F, size=14, bold=True, color=NAVY)
sub = Font(name=F, size=11, bold=True, color=VERMELHO)
linha = [1]


def bloco(t):
    linha[0] += 1
    c = wu.cell(row=linha[0], column=1, value=t)
    c.font = sub
    linha[0] += 1


def item(a, b='', c='', d=''):
    for i, v in enumerate([a, b, c, d], start=1):
        x = wu.cell(row=linha[0], column=i, value=v)
        x.font = fonte
        x.alignment = quebra
    linha[0] += 1


wu.cell(row=1, column=1, value='Questão de Embarque: como usar esta planilha').font = titulo
linha[0] = 2
item('Programa', f"365 dias, de {data_br(PROG['periodo']['inicio'])} a {data_br(PROG['periodo']['fim'])}; o gabarito do dia 365 sai em {data_br(PROG['periodo']['ultima_explicacao'])}, no post de encerramento.")
nums = PROG['numeros']
item('Números', f"{nums['dias']} questões ({nums['por_step']['Step 1']} de Step 1 e {nums['por_step']['Step 2 CK']} de Step 2 CK), {nums['remix']} remixes de domingo, {nums['imagens']} imagens, {nums['tom_acolhedor']} dias em tom acolhedor. Letra certa: A {nums['letras']['A']}, B {nums['letras']['B']}, C {nums['letras']['C']}, D {nums['letras']['D']}.")
item('Cores das linhas', 'Cinza: Remix de Domingo. Azul claro: data sensível, tom acolhedor e sem piada. Amarelo claro: colunas de status para preencher (lista suspensa).')
item('Onde editar', 'Só as colunas amarelas (status, data de postagem, métricas e observações). O conteúdo vem de instagram/dias/; corrija lá e gere a planilha de novo.')
item('Exemplo de preenchimento', 'Status imagem questão = Aprovada; Status feed (D) = Postado; Postado em = 02/11/2026; Alcance = 4200; Salvamentos = 310 (a taxa de salvamento se calcula sozinha); Acerto no quiz (%) = 58.')

bloco('Rotina diária (horário de Brasília)')
for h, o in [('12h00', 'Feed: carrossel de 8 slides com a recompensa primeiro (slides 1 a 4: gabarito de ontem, abrindo com a letra; 5 a 8: questão de hoje e CTA), com a coluna "Legenda do post de D". No dia 1, só a questão. Modo enxuto: 6 slides (pasta post-do-dia-enxuto).'),
             ('12h01', 'Primeiro comentário fixado no post: a "Legenda D+1" do dia anterior (explicação completa, sem endereço escrito).'),
             ('12h05', 'Story do gabarito de ontem: story-gabarito.png do dia anterior com as porcentagens da enquete de ontem + adesivo de QUIZ com a pergunta da coluna "Quiz do D+1 e Reel" e a letra certa marcada (segunda chance).'),
             ('12h06', 'Story da questão de hoje: story-enquete.png + adesivo de ENQUETE "Qual é a sua letra?" com A, B, C e D em inglês, sem resposta certa e sem achado da vinheta.'),
             ('12h07', 'Controle deslizante "Quanta certeza você tem?" (modo completo).'),
             ('20h30', 'Resultado parcial da enquete sem revelar a letra + adesivo de link para o post (modo completo).'),
             ('Sexta 12h', 'Trocar o texto do MACETE pelo pacote da semana (aba Automação de DM).'),
             ('Sexta 19h00', 'Reel da semana (aba Reels semanais), com a voz gravada no celular ou o áudio sugerido.'),
             ('Domingo 18h00', 'Placar da semana: as três questões com menor acerto + link do simulado; check-in do desafio quando houver.'),
             ('Última quinta 20h30', 'Live de Correção (aba Automação de DM, datas e roteiro).'),
             ('Primeiras 4 semanas', 'Testar 20h30 nas terças e quintas e ficar com o horário de mais salvamentos por alcance.')]:
    item(h, o)

bloco('Stories, CTA e conversão')
item('Enquete e quiz', 'No dia D, só enquete, com a pergunta "Qual é a sua letra?" e as opções curtas em inglês (até 30 caracteres, colunas de opção A a D), sem achado da vinheta. O quiz, que mostra a letra certa, entra no D+1, com a pergunta que traz o achado (coluna "Quiz do D+1 e Reel").')
item('CTA', 'Palavra-chave por quadro, sem endereço na legenda: SIMULADO (terça e quinta), MACETE (segunda e sexta), FACULDADE (primeira quarta do mês), EMBARQUE (domingo), DESAFIO (semana de inscrição), LIVE (dia da live e sábado antes). Quarta pede compartilhamento e sábado, debate. Textos da resposta automática na aba Automação de DM.')
item('Destaques fixos', 'Step 1, Step 2 CK, Remix, Desafio, Live, Simulado grátis, Pré-inscrição.')

bloco('Fluxo de geração das imagens (Higgsfield)')
for a, b in [('1. Abrir', 'Higgsfield, gerador de imagem, modelo Nano Banana Pro, resolução 2k, proporção 4:5.'),
             ('0. Uma vez', 'Gerar as 10 folhas de referência dos personagens (aba Personagens, coluna do prompt da folha; 2k, 16:9), salvar em instagram/imagens/referencias/, subir no Higgsfield e anotar o media_id em instagram/personagens-referencia.json.'),
             ('2. Copiar', 'Aba "Prompts das imagens": copie a célula do prompt inteira (estilo, personagem fixo, cena, fundo limpo, referência, composição e proibições já estão nela) e anexe em medias, com role image_references, a folha de cada personagem da coluna "Referência do personagem". Duas imagens por dia: questão (D) e explicação (D+1).'),
             ('3. Conferir', 'Sem texto, letras ou números na imagem; personagem igual à folha de referência; no máximo 3 elementos principais; terço de baixo liso (a placa do gancho cobre essa área); a imagem da questão não pode mostrar nem apontar a resposta.'),
             ('4. Salvar', 'Com o nome da coluna "Nome de arquivo esperado": instagram/imagens/dia-NNN.png e dia-NNN-macete.png.'),
             ('5. Marcar', 'Status da geração = Gerada; depois da revisão, Aprovada (ou Refazer, com o motivo em Observações).'),
             ('Ritmo', 'Lote toda quarta-feira para a semana que começa na segunda seguinte (aba Rotina semanal).')]:
    item(a, b)

bloco('Renderização dos posts')
for a, b in [('Validar o ano', 'node instagram/ferramentas/validar-dias.mjs (grava instagram/questoes/ e roda render.mjs --so-conferir nos 365 dias, com a comparação com o banco privado).'),
             ('Renderizar uma semana', 'node instagram/templates/render.mjs --intervalo 15-21'),
             ('Saída', 'instagram/saida/dia-NNN/: post-do-dia/ e post-do-dia-enxuto/ (carrosséis numerados), legenda.txt, stories.txt, story-enquete.png, story-gabarito.png, os guias e manifesto.json.'),
             ('Reels', 'cd reels && npm run render:semanais -- semana-NN (vídeo em reels/out/semanais/).'),
             ('Sem imagem', 'Os slides saem com a marca IMAGEM PENDENTE e o nome do arquivo esperado. Gere a imagem e renderize de novo.'),
             ('Atualizar a planilha', 'node instagram/ferramentas/montar-programa.mjs && python3 instagram/ferramentas/gerar-planilha.py')]:
    item(a, b)

bloco('Regras de humor e compliance (resumo)')
for a, b in [('Humor', 'A piada aponta para a resposta e continuaria engraçada se alguém com a doença estivesse lendo. Nunca sobre paciente, corpo, grupos, profissões, doença grave ou estigmatizada.'),
             ('Datas sensíveis', 'Finados, AIDS, Janeiro Branco, Câncer, Down, Autismo, Setembro Amarelo (CVV 188), Alzheimer, Saúde Mental, início do Outubro Rosa e do Novembro Azul: personagens explicam, sem gag.'),
             ('CFM 2.336/2023', 'Sem promessa de aprovação, nota ou Match; sem "o melhor curso"; nome e CRM-DF 13610 em toda legenda; especialidade só com RQE.'),
             ('Imagens', 'Só ilustração própria; nada de paciente, exame real, pessoa reconhecível ou material de terceiros.')]:
    item(a, b)

bloco('Fontes que precisam ser reconferidas antes de postar (compiladas dos relatórios dos revisores)')
for i, v in enumerate(['Dia', 'Data', 'O que conferir', 'Fonte citada']):
    c = wu.cell(row=linha[0], column=i + 1, value=v)
    c.font = cab_font
    c.fill = cab_fill
linha[0] += 1
pend = re.compile(r'(re)?conferir|estiver vigente|vers[aã]o vigente|edi[cç][aã]o vigente', re.I)
ignorar = re.compile(r'gancho dizia|^IRT', re.I)
n_fontes = 0
for d in PROG['dias']:
    rev = d['revisao'] or {}
    frases = []
    for k in ('medica', 'humor_compliance'):
        for s in re.split(r'(?<=[.;])\s+', rev.get(k, '')):
            if pend.search(s) and not ignorar.search(s) and not re.match(r'^Conferid', s):
                frases.append(s.strip().rstrip(';'))
    if frases:
        item(f"Dia {d['dia']} ({d['quadro']})", data_br(d['data']), ' '.join(frases), d['fonte'])
        n_fontes += 1
item('Datas móveis de 2027', 'Carnaval 09/02, Cinzas 10/02, Sexta-feira Santa 26/03, Páscoa 28/03, Match Day 19/03 (NRMP) e prazo do rank order list 03/03: reconferir uma semana antes de cada post.')
item('Todo trimestre', 'Questões de rastreamento, vacinas e conduta: conferir a diretriz vigente (lista por instituição abaixo).')

bloco('Diretrizes citadas, por instituição (dias)')
orgs = ['CDC', 'ACIP', 'USPSTF', 'Preventive Services Task Force', 'AHA', 'ACC', 'AAP', 'ACOG', 'IDSA', 'ADA', 'GINA', 'GOLD', 'KDIGO', 'AASLD', 'ACG', 'AGA',
        'ACR', 'AUA', 'ESC', 'ATLS', 'Endocrine Society', 'Joint Commission', 'AMA', 'FDA', 'WHO', 'ASA', 'ATA', 'AAOS', 'ACCP', 'AAN', 'NCCN', 'Surviving Sepsis']
grupo = defaultdict(list)
for d in PROG['dias']:
    for o in orgs:
        if re.search(r'\b' + re.escape(o) + r'\b', d['fonte'] or ''):
            grupo['USPSTF' if o == 'Preventive Services Task Force' else o].append(d['dia'])
for o, ds in sorted(grupo.items(), key=lambda x: -len(x[1])):
    item(o, ', '.join(map(str, sorted(set(ds)))), f'{len(set(ds))} dias')

bloco('Andamento (atualiza sozinho com os status da aba Calendário)')
cal_ref = "'Calendário'!"
for nome, opcoes in [('Status imagem questão', STATUS_IMG), ('Status imagem explicação', STATUS_IMG), ('Status render', STATUS_RENDER), ('Status feed (D)', STATUS_POST)]:
    col = letra(idx[nome])
    for o in opcoes:
        wu.cell(row=linha[0], column=1, value=f'{nome}: {o}').font = fonte
        c = wu.cell(row=linha[0], column=2, value=f'=COUNTIF({cal_ref}{col}2:{col}{ult},"{o}")')
        c.font = fonte
        c.alignment = Alignment(horizontal='left')
        linha[0] += 1
col_t = letra(idx['Taxa de salvamento'])
wu.cell(row=linha[0], column=1, value='Taxa média de salvamento').font = fonte
c = wu.cell(row=linha[0], column=2, value=f'=IFERROR(AVERAGE({cal_ref}{col_t}2:{col_t}{ult}),"")')
c.number_format = '0.0%'
c.alignment = Alignment(horizontal='left')
linha[0] += 1


wb.active = 0
SAIDA.parent.mkdir(parents=True, exist_ok=True)
wb.save(SAIDA)
print(f'{SAIDA.relative_to(RAIZ)}: {N} dias, {2 * N} prompts, {len(PROG["personagens"]) + len(PROG["apoio"])} personagens e apoios, {len(RS["reels"])} Reels, {len(AD["palavras"])} palavras-chave, {n_fontes} dias com fonte a reconferir')
