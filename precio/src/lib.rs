//! Interpretación estricta de precios en euros.
//!
//! Hay dos formatos, y quien llama dice cuál espera, porque sabe de dónde sale
//! el texto:
//!
//! - [`Format::Machine`]: datos estructurados (JSON-LD, metaetiquetas). El
//!   punto es decimal y no hay separador de miles: `1099.95`, `2499`.
//! - [`Format::Es`]: texto visible de una tienda española. El punto separa
//!   miles y la coma separa decimales: `1.099,95 €`, `2.499€`, `19,99`.
//!
//! El parser anterior (en Python) adivinaba el formato y leía `2.499€` como
//! 2,50 €. Aquí un texto ambiguo se rechaza en lugar de adivinarse.
//!
//! El resultado son **céntimos** en un `i64`: sin coma flotante en ningún paso.

use std::fmt;

/// Tope de cordura: nada en estas tiendas cuesta un millón de euros o más.
pub const MAX_CENTS_EXCLUSIVE: i64 = 100_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Machine,
    Es,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriceError {
    Empty,
    InvalidMachine,
    InvalidEs,
    NotPositive,
    OutOfRange,
}

impl PriceError {
    /// Código estable que usa el enlace de Python para construir sus mensajes.
    pub fn code(self) -> &'static str {
        match self {
            PriceError::Empty => "empty",
            PriceError::InvalidMachine => "invalid_machine",
            PriceError::InvalidEs => "invalid_es",
            PriceError::NotPositive => "not_positive",
            PriceError::OutOfRange => "out_of_range",
        }
    }
}

impl fmt::Display for PriceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

impl std::error::Error for PriceError {}

/// Convierte un precio a céntimos.
pub fn parse_cents(raw: &str, format: Format) -> Result<i64, PriceError> {
    let text = strip_currency(raw);
    if text.is_empty() {
        return Err(PriceError::Empty);
    }
    let cents = match format {
        Format::Machine => parse_machine(&text)?,
        Format::Es => parse_es(&text)?,
    };
    if cents <= 0 {
        return Err(PriceError::NotPositive);
    }
    if cents >= MAX_CENTS_EXCLUSIVE {
        return Err(PriceError::OutOfRange);
    }
    Ok(cents)
}

/// Quita «€», «EUR», «euro», «euros» (sin distinguir mayúsculas) y normaliza los espacios duros.
fn strip_currency(raw: &str) -> String {
    const WORDS: [&[u8]; 3] = [b"euros", b"euro", b"eur"];
    let normalized: String = raw
        .chars()
        .map(|c| if c == '\u{a0}' || c == '\u{202f}' { ' ' } else { c })
        .collect();

    let mut out = String::with_capacity(normalized.len());
    let mut rest = normalized.as_str();
    'outer: while let Some(c) = rest.chars().next() {
        if c == '€' {
            rest = &rest[c.len_utf8()..];
            continue;
        }
        for word in WORDS {
            let bytes = rest.as_bytes();
            if bytes.len() >= word.len() && bytes[..word.len()].eq_ignore_ascii_case(word) {
                rest = &rest[word.len()..];
                continue 'outer;
            }
        }
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out.trim().to_string()
}

fn all_ascii_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

fn digits_to_i64(s: &str) -> Result<i64, PriceError> {
    s.bytes().try_fold(0_i64, |acc, b| {
        acc.checked_mul(10)
            .and_then(|v| v.checked_add(i64::from(b - b'0')))
            .ok_or(PriceError::OutOfRange)
    })
}

fn to_cents(euros: i64, decimals: &str) -> Result<i64, PriceError> {
    let mut cents = euros.checked_mul(100).ok_or(PriceError::OutOfRange)?;
    let mut digits = decimals.bytes();
    let tens = digits.next().map_or(0, |b| i64::from(b - b'0'));
    let units = digits.next().map_or(0, |b| i64::from(b - b'0'));
    cents = cents
        .checked_add(tens * 10 + units)
        .ok_or(PriceError::OutOfRange)?;
    Ok(cents)
}

/// `1099.95`, `2499`, `0.30000000000000004` (redondeo a céntimos, mitad al par).
fn parse_machine(text: &str) -> Result<i64, PriceError> {
    let (int_part, frac_part) = match text.split_once('.') {
        Some((int_part, frac)) => {
            if !all_ascii_digits(frac) {
                return Err(PriceError::InvalidMachine);
            }
            (int_part, frac)
        }
        None => (text, ""),
    };
    if !all_ascii_digits(int_part) {
        return Err(PriceError::InvalidMachine);
    }
    let euros = digits_to_i64(int_part)?;
    let head = &frac_part[..frac_part.len().min(2)];
    let tail = &frac_part[head.len()..];
    let cents = to_cents(euros, head)?;
    Ok(round_half_even(cents, tail))
}

/// Decide el redondeo con las cifras que sobran tras los céntimos.
fn round_half_even(cents: i64, tail: &str) -> i64 {
    let mut digits = tail.bytes();
    let Some(first) = digits.next() else {
        return cents;
    };
    let round_up = match first.cmp(&b'5') {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => digits.any(|d| d != b'0') || cents % 2 == 1,
    };
    if round_up {
        cents.saturating_add(1)
    } else {
        cents
    }
}

/// `1.099,95`, `2.499`, `19,99`, `1 099,95`, `649`.
///
/// El separador de miles puede ser punto o espacio, pero solo uno de los dos y solo
/// entre grupos de tres cifras: «649 99» o «1 2 3» se rechazan.
fn parse_es(text: &str) -> Result<i64, PriceError> {
    let (int_part, decimals) = match text.split_once(',') {
        Some((int_part, decimals)) => {
            if decimals.is_empty() || decimals.len() > 2 || !all_ascii_digits(decimals) {
                return Err(PriceError::InvalidEs);
            }
            (int_part, decimals)
        }
        None => (text, ""),
    };

    let separator = match (int_part.contains('.'), int_part.contains(' ')) {
        (true, true) => return Err(PriceError::InvalidEs),
        (true, false) => Some('.'),
        (false, true) => Some(' '),
        (false, false) => None,
    };

    let digits = match separator {
        Some(sep) => {
            // Primer grupo de 1 a 3 cifras y el resto de exactamente 3.
            let mut groups = int_part.split(sep);
            let first = groups.next().unwrap_or_default();
            if first.is_empty() || first.len() > 3 || !all_ascii_digits(first) {
                return Err(PriceError::InvalidEs);
            }
            let mut joined = first.to_string();
            for group in groups {
                if group.len() != 3 || !all_ascii_digits(group) {
                    return Err(PriceError::InvalidEs);
                }
                joined.push_str(group);
            }
            joined
        }
        None => {
            if !all_ascii_digits(int_part) {
                return Err(PriceError::InvalidEs);
            }
            int_part.to_string()
        }
    };

    let euros = digits_to_i64(&digits)?;
    to_cents(euros, decimals)
}

#[cfg(feature = "python")]
mod python {
    use pyo3::exceptions::PyValueError;
    use pyo3::prelude::*;

    use super::{parse_cents as parse, Format};

    /// parse_cents(raw: str, fmt: "machine" | "es") -> int (céntimos).
    /// Lanza ValueError con un código: empty, invalid_machine, invalid_es, not_positive, out_of_range.
    #[pyfunction]
    fn parse_cents(raw: &str, fmt: &str) -> PyResult<i64> {
        let format = match fmt {
            "machine" => Format::Machine,
            "es" => Format::Es,
            other => return Err(PyValueError::new_err(format!("unknown_format:{other}"))),
        };
        parse(raw, format).map_err(|err| PyValueError::new_err(err.code()))
    }

    #[pymodule]
    fn precio(module: &Bound<'_, PyModule>) -> PyResult<()> {
        module.add_function(wrap_pyfunction!(parse_cents, module)?)?;
        module.add("MAX_CENTS_EXCLUSIVE", super::MAX_CENTS_EXCLUSIVE)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn es(raw: &str) -> Result<i64, PriceError> {
        parse_cents(raw, Format::Es)
    }

    fn machine(raw: &str) -> Result<i64, PriceError> {
        parse_cents(raw, Format::Machine)
    }

    #[test]
    fn regression_thousands_without_cents() {
        // El fallo que motivó reescribirlo: «2.499€» se leía como 2,50 €.
        assert_eq!(es("2.499€"), Ok(249_900));
        assert_eq!(es("1.234 €"), Ok(123_400));
    }

    #[test]
    fn spanish_examples() {
        assert_eq!(es("1.099,95 €"), Ok(109_995));
        assert_eq!(es("9.744,15\u{a0}€"), Ok(974_415));
        assert_eq!(es("19,9 €"), Ok(1_990));
        assert_eq!(es("1\u{202f}099,95 €"), Ok(109_995));
        assert_eq!(es("  89,00 euros "), Ok(8_900));
        assert_eq!(es("EUR 49,90"), Ok(4_990));
        assert_eq!(es("1 099,95 €"), Ok(109_995));
        assert_eq!(es("12 345 678,00"), Err(PriceError::OutOfRange));
    }

    #[test]
    fn spanish_rejections() {
        for raw in [
            "", "  ", "sin precio", "12.5", "1.23,45", "1,234.56", "19,999", "0,00", "-5,00", "1.000.000,00",
            // Espacios fuera de su sitio (encontrado en la revisión): antes «649 99 €» daba 64.999 €.
            "649 99 €", "19 99", "1 2 3", "1.099 999,00", "1 099 ,95",
        ] {
            assert!(es(raw).is_err(), "debería rechazar {raw:?}");
        }
    }

    #[test]
    fn machine_examples() {
        assert_eq!(machine("1099.95"), Ok(109_995));
        assert_eq!(machine("2499"), Ok(249_900));
        assert_eq!(machine("0.30000000000000004"), Ok(30));
        assert_eq!(machine("1099.9"), Ok(109_990));
    }

    #[test]
    fn machine_rejections() {
        for raw in ["1.099,95", "1,099.95", "abc", "", "-1", "0", "1.", ".5", "0.001", "1e3"] {
            assert!(machine(raw).is_err(), "debería rechazar {raw:?}");
        }
    }

    #[test]
    fn half_even_rounding() {
        assert_eq!(machine("0.125"), Ok(12));
        assert_eq!(machine("0.135"), Ok(14));
        assert_eq!(machine("0.1251"), Ok(13));
        assert_eq!(machine("0.124999"), Ok(12));
        assert_eq!(machine("999999.995"), Err(PriceError::OutOfRange));
    }

    #[test]
    fn huge_numbers_do_not_overflow() {
        assert_eq!(machine("99999999999999999999999"), Err(PriceError::OutOfRange));
        assert_eq!(es("99.999.999.999.999.999.999.999"), Err(PriceError::OutOfRange));
    }

    /// Escribe céntimos como lo haría una tienda española: «1.234.567,89».
    fn format_es(cents: i64, grouped: bool, with_cents: bool) -> String {
        let euros = (cents / 100).to_string();
        let int_part = if grouped {
            let bytes = euros.as_bytes();
            let mut out = String::new();
            for (i, b) in bytes.iter().enumerate() {
                if i > 0 && (bytes.len() - i) % 3 == 0 {
                    out.push('.');
                }
                out.push(*b as char);
            }
            out
        } else {
            euros
        };
        if with_cents {
            format!("{int_part},{:02} €", cents % 100)
        } else {
            format!("{int_part}€")
        }
    }

    proptest! {
        #[test]
        fn spanish_round_trip(cents in 1_i64..MAX_CENTS_EXCLUSIVE, grouped: bool) {
            prop_assert_eq!(es(&format_es(cents, grouped, true)), Ok(cents));
        }

        #[test]
        fn space_grouping_round_trip(cents in 1_i64..MAX_CENTS_EXCLUSIVE) {
            let text = format_es(cents, true, true).replace('.', " ");
            prop_assert_eq!(es(&text), Ok(cents));
        }

        #[test]
        fn spanish_whole_euros_are_never_read_as_decimals(euros in 1_i64..1_000_000) {
            // Propiedad que el parser antiguo violaba: «2.499€» es 2.499 €, nunca 2,50 €.
            prop_assert_eq!(es(&format_es(euros * 100, true, false)), Ok(euros * 100));
        }

        #[test]
        fn machine_round_trip(cents in 1_i64..MAX_CENTS_EXCLUSIVE) {
            let text = format!("{}.{:02}", cents / 100, cents % 100);
            prop_assert_eq!(machine(&text), Ok(cents));
        }

        #[test]
        fn never_panics(raw in "\\PC{0,40}") {
            let _ = es(&raw);
            let _ = machine(&raw);
        }

        #[test]
        fn results_are_always_in_range(raw in "[0-9.,€ ]{1,20}") {
            for result in [es(&raw), machine(&raw)] {
                if let Ok(cents) = result {
                    prop_assert!(cents > 0 && cents < MAX_CENTS_EXCLUSIVE);
                }
            }
        }
    }
}
