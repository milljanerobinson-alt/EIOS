/*
# Update profile creation trigger to assign admin role to first user

1. Changes
- Modified `handle_new_user()` trigger function: assigns 'admin' role to the very first user who signs up, 'trainer' to subsequent users (instead of defaulting everyone to 'candidate').
- This ensures the first person to create an account can access all admin features immediately.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count integer;
  assigned_role text;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;

  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'trainer';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;

  RETURN NEW;
END;
$$;
