/* Road to America | simulado: calculadora padrão (quatro operações, porcentagem,
   raiz quadrada, inversão de sinal), como a calculadora simples do dia da prova.
   Máquina de estados pura: teclar(estado, tecla) devolve um novo estado. */

export function novaCalculadora() {
  return { visor: "0", acumulado: null, operador: null, novoNumero: true, erro: false, expressao: "" };
}

const MAX_DIGITOS = 14;
const SIMBOLO = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/* Formata um número para o visor, sem notação estranha para valores comuns */
export function formatar(n) {
  if (!Number.isFinite(n)) return "Erro";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, "e");
  const s = String(parseFloat(n.toPrecision(12)));
  return s.length > MAX_DIGITOS + 2 ? String(parseFloat(n.toPrecision(10))) : s;
}

function calcular(a, op, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? NaN : a / b;
    default: return b;
  }
}

/* teclas: "0".."9", ".", "+", "-", "*", "/", "=", "%", "sqrt", "neg", "C" (zera tudo), "CE" (zera o visor), "back" */
export function teclar(e, tecla) {
  const s = { ...e };
  if (s.erro && tecla !== "C") return s;
  if (/^[0-9]$/.test(tecla)) {
    if (s.novoNumero) { s.visor = tecla; s.novoNumero = false; }
    else if (s.visor.replace(/[-.]/g, "").length < MAX_DIGITOS) s.visor = s.visor === "0" ? tecla : s.visor + tecla;
    return s;
  }
  switch (tecla) {
    case ".":
      if (s.novoNumero) { s.visor = "0."; s.novoNumero = false; }
      else if (!s.visor.includes(".")) s.visor += ".";
      return s;
    case "+": case "-": case "*": case "/": {
      const v = parseFloat(s.visor);
      if (s.operador && !s.novoNumero) {
        const r = calcular(s.acumulado, s.operador, v);
        if (!Number.isFinite(r)) return { ...novaCalculadora(), visor: "Erro", erro: true };
        s.acumulado = r;
        s.visor = formatar(r);
      } else if (!s.operador) {
        s.acumulado = v;
      } /* operador pendente e nenhum número novo: só troca o operador */
      s.operador = tecla;
      s.novoNumero = true;
      s.expressao = formatar(s.acumulado) + " " + SIMBOLO[tecla];
      return s;
    }
    case "=": {
      if (!s.operador) { s.novoNumero = true; return s; }
      const v = parseFloat(s.visor);
      const r = calcular(s.acumulado, s.operador, v);
      if (!Number.isFinite(r)) return { ...novaCalculadora(), visor: "Erro", erro: true };
      s.expressao = formatar(s.acumulado) + " " + SIMBOLO[s.operador] + " " + formatar(v) + " =";
      s.visor = formatar(r);
      s.acumulado = null;
      s.operador = null;
      s.novoNumero = true;
      return s;
    }
    case "%": {
      const v = parseFloat(s.visor);
      /* como nas calculadoras de mesa: com operação pendente, % é a fração do acumulado */
      const r = s.operador && s.acumulado !== null && (s.operador === "+" || s.operador === "-") ? (s.acumulado * v) / 100 : v / 100;
      s.visor = formatar(r);
      s.novoNumero = true;
      return s;
    }
    case "sqrt": {
      const v = parseFloat(s.visor);
      if (v < 0) return { ...novaCalculadora(), visor: "Erro", erro: true };
      s.visor = formatar(Math.sqrt(v));
      s.novoNumero = true;
      return s;
    }
    case "neg":
      if (s.visor !== "0") s.visor = s.visor.startsWith("-") ? s.visor.slice(1) : "-" + s.visor;
      return s;
    case "back":
      if (s.novoNumero) return s;
      s.visor = s.visor.length > 1 && !(s.visor.length === 2 && s.visor.startsWith("-")) ? s.visor.slice(0, -1) : "0";
      return s;
    case "CE":
      s.visor = "0";
      s.novoNumero = true;
      return s;
    case "C":
      return novaCalculadora();
    default:
      return s;
  }
}

/* Tecla do teclado físico para a tecla da calculadora (ou null) */
export function teclaDoTeclado(key) {
  if (/^[0-9]$/.test(key)) return key;
  const mapa = { ".": ".", ",": ".", "+": "+", "-": "-", "*": "*", x: "*", X: "*", "/": "/", "=": "=", Enter: "=", "%": "%", Backspace: "back", Delete: "CE", Escape: null };
  return Object.prototype.hasOwnProperty.call(mapa, key) ? mapa[key] : null;
}
