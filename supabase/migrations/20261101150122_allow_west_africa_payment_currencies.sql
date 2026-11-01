-- Applied in Supabase as migration allow_west_africa_payment_currencies.
-- Only allow currencies explicitly enabled by the LomoPay configuration layer.
create or replace function public.apply_paydunya_payment(
 p_user_id uuid,p_payment_id text,p_plan_id text,p_amount integer,p_currency text,p_credits integer,p_status text,
 p_method text default null,p_gateway text default 'paydunya',p_raw_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_tx public.payment_transactions; v_new_credits integer;
begin
 if upper(p_currency) not in ('XOF','GHS','NGN','GNF','SLE','LRD') then raise exception 'payment_currency_invalid'; end if;
 if lower(p_status)<>'completed' then return jsonb_build_object('credited',false,'creditsAdded',0,'status',p_status,'paymentId',p_payment_id); end if;
 if p_amount<=0 or p_credits<=0 then raise exception 'payment_amount_invalid'; end if;
 insert into public.payment_transactions(user_id,payment_id,plan_id,amount,currency,credits,status,method,gateway,raw_payload,processed_at,updated_at)
 values(p_user_id,p_payment_id,p_plan_id,p_amount,upper(p_currency),p_credits,'success',p_method,p_gateway,coalesce(p_raw_payload,'{}'::jsonb),now(),now())
 on conflict(payment_id) do nothing returning * into v_tx;
 if v_tx.id is null then
  select credits into v_new_credits from public.profiles where id=p_user_id;
  return jsonb_build_object('credited',false,'creditsAdded',0,'totalCredits',v_new_credits,'status','success','paymentId',p_payment_id,'alreadyProcessed',true);
 end if;
 update public.profiles set credits=credits+p_credits,updated_at=now() where id=p_user_id returning credits into v_new_credits;
 if not found then delete from public.payment_transactions where id=v_tx.id; raise exception 'profile_not_found_for_payment'; end if;
 return jsonb_build_object('credited',true,'creditsAdded',p_credits,'totalCredits',v_new_credits,'status','success','paymentId',p_payment_id,'alreadyProcessed',false);
end; $function$;
