import { DateTime } from "luxon";

interface ResultadoHoras {
    /** Horas trabalhadas no expediente ou totais (formato "HH:MM") */
    normais: string;
    /** Horas extras (formato "HH:MM"), se aplicável */
    extras: string;
}

export function convertHHMMToDecimal(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
}

export function calcularHorasTrabalhadas(
    inicioUtc: string,
    fimUtc: string,
    inicioExp: string | null,
    fimExp: string | null,
    breakMinutes: number = 0,
): ResultadoHoras {
    try {
        // Conversor de ms para "HH:MM"
        const formatHM = (ms: number): string => {
            const totalMin = Math.floor(ms / 60000);
            const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
            const m = (totalMin % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        };

        // Converter para DateTime para melhor manipulação de timezone
        const inicioLocal = DateTime.fromJSDate(new Date(inicioUtc));
        let fimLocal = DateTime.fromJSDate(new Date(fimUtc));

        // Se virar o dia
        if (fimLocal <= inicioLocal) {
            fimLocal = fimLocal.plus({ days: 1 });
        }

        const msBreak = breakMinutes * 60000;
        const msTotalSemDesconto = fimLocal.toMillis() - inicioLocal.toMillis();
        const msTotal = Math.max(0, msTotalSemDesconto - msBreak);

        // Se não tiver horário de expediente definido, retorna tudo como horas normais
        if (!inicioExp || !fimExp) {
            return {
                normais: formatHM(msTotal),
                extras: '00:00'
            };
        }

        // Configurar horários do expediente para o mesmo dia do início
        const [hIn, mIn] = inicioExp.split(":").map(Number);
        const [hOut, mOut] = fimExp.split(":").map(Number);

        const expInDate = inicioLocal.set({ hour: hIn, minute: mIn });
        const expOutDate = inicioLocal.set({ hour: hOut, minute: mOut });

        // Calcular milissegundos dentro do expediente (sem desconto ainda)
        const msInicioNorm = Math.max(inicioLocal.toMillis(), expInDate.toMillis());
        const msFimNorm = Math.min(fimLocal.toMillis(), expOutDate.toMillis());
        const msNormaisBruto = Math.max(0, msFimNorm - msInicioNorm);

        // O desconto do break prioriza as horas normais
        const msNormais = Math.max(0, msNormaisBruto - msBreak);
        
        // Se o break for maior que as horas normais, o restante desconta das extras
        const msBreakRestante = Math.max(0, msBreak - msNormaisBruto);
        const msExtrasBruto = Math.max(0, msTotalSemDesconto - msNormaisBruto);
        const msExtras = Math.max(0, msExtrasBruto - msBreakRestante);

        return {
            normais: formatHM(msNormais),
            extras: formatHM(msExtras)
        };
    } catch (error) {
        return {
            normais: '00:00',
            extras: '00:00'
        };
    }
}
