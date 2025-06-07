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

        const msTotal = fimLocal.toMillis() - inicioLocal.toMillis();

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

        // Calcular milissegundos dentro do expediente
        const msInicioNorm = Math.max(inicioLocal.toMillis(), expInDate.toMillis());
        const msFimNorm = Math.min(fimLocal.toMillis(), expOutDate.toMillis());
        const msNormais = Math.max(0, msFimNorm - msInicioNorm);

        // Calcular extras
        const msExtras = Math.max(0, msTotal - msNormais);

        return {
            normais: formatHM(msNormais),
            extras: formatHM(msExtras)
        };
    } catch (error) {
        console.error('Erro ao calcular horas:', error, { inicioUtc, fimUtc });
        return {
            normais: '00:00',
            extras: '00:00'
        };
    }
}
