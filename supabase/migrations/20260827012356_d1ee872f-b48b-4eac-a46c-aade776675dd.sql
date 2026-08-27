CREATE OR REPLACE FUNCTION public.ensure_super_admin_bootstrap()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _first uuid;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS NULL THEN RETURN false; END IF;

  -- garante profile (o trigger de auth pode não existir em bancos remixados)
  INSERT INTO public.profiles (user_id, email)
  VALUES (_uid, _email)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role
  ) INTO _exists;
  IF _exists THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _uid AND role = 'super_admin'::public.app_role
    );
  END IF;

  -- somente o PRIMEIRO usuário criado no sistema pode ser promovido
  SELECT id INTO _first FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF _first IS DISTINCT FROM _uid THEN RETURN false; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.app_config (id, super_admin_emails)
  VALUES (true, ARRAY[_email])
  ON CONFLICT (id) DO UPDATE
    SET super_admin_emails = (
      SELECT ARRAY(SELECT DISTINCT unnest(public.app_config.super_admin_emails || ARRAY[_email]))
    ),
    updated_at = now();

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.ensure_super_admin_bootstrap() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_bootstrap() TO service_role;

-- handle_new_user: só promove se for realmente o primeiro usuário do sistema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _exists boolean;
  _first uuid;
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role
  ) INTO _exists;

  SELECT id INTO _first FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF NOT _exists AND NEW.email IS NOT NULL AND (_first IS NULL OR _first = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.app_config (id, super_admin_emails)
    VALUES (true, ARRAY[NEW.email])
    ON CONFLICT (id) DO UPDATE
      SET super_admin_emails = (
        SELECT ARRAY(SELECT DISTINCT unnest(public.app_config.super_admin_emails || ARRAY[NEW.email]))
      ),
      updated_at = now();
  END IF;

  RETURN NEW;
END $function$;