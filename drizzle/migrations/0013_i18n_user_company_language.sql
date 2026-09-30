ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS idioma text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_idioma_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_idioma_check CHECK (idioma IS NULL OR idioma IN ('pt-BR','es-ES'));
ALTER TABLE public.company ADD COLUMN IF NOT EXISTS idioma_padrao text NOT NULL DEFAULT 'pt-BR';
ALTER TABLE public.company DROP CONSTRAINT IF EXISTS company_idioma_padrao_check;
ALTER TABLE public.company ADD CONSTRAINT company_idioma_padrao_check CHECK (idioma_padrao IN ('pt-BR','es-ES'));