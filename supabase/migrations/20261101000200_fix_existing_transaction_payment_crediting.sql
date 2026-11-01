-- Credit the transaction that checkout already created, exactly once.
-- Preserve idempotency by locking the payment row and marking it successful atomically.
create or replace function public.apply_paydunya_payment(
  p_user_id uuid,
  p_payment_id text,
  p_plan_id text,
  p_amount integer,
  p_currency text,
  p_credits integer,
  p_status text,
  p_method text default null,
  p_gateway text default 'paydunya',
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx public.payment_transactions;
  v_new_credits integer;
begin
  if upper(p_currency) not in ('XOF','GHS','NGN','GNF','SLE','LRD') then
    raise exception 'payment_currency_invalid';
  end if;
  if lower(p_status) <> 'completed' then
    return jsonb_build_object('credited',false,'creditsAdded',0,'status',p_status,'paymentId',p_payment_id);
  end if;
  if p_amount <= 0 or p_credits <= 0 then raise exception 'payment_amount_invalid'; end if;

  select * into v_tx from public.payment_transactions
  where payment_id=p_payment_id for update;

  if found then
    if v_tx.user_id <> p_user_id or v_tx.plan_id <> p_plan_id
       or v_tx.amount <> p_amount or upper(v_tx.currency) <> upper(p_currency)
       or v_tx.credits <> p_credits or coalesce(v_tx.gateway,p_gateway) <> p_gateway then
      raise exception 'payment_metadata_mismatch';
    end if;
    if v_tx.status='success' or v_tx.processed_at is not null then
      select credits into v_new_credits from public.profiles where id=p_user_id;
      return jsonb_build_object('credited',false,'creditsAdded',0,'totalCredits',v_new_credits,'status','success','paymentId',p_payment_id,'alreadyProcessed',true);
    end if;
    update public.payment_transactions set status='success',
      method=coalesce(p_method,method), gateway=p_gateway,
      raw_payload=coalesce(p_raw_payload,'{}'::jsonb),
      processed_at=now(), updated_at=now()
    where id=v_tx.id;
  else
    insert into public.payment_transactions(
      user_id,payment_id,plan_id,amount,currency,credits,status,method,gateway,raw_payload,processed_at,updated_at
    ) values (
      p_user_id,p_payment_id,p_plan_id,p_amount,upper(p_currency),p_credits,'success',p_method,p_gateway,
      coalesce(p_raw_payload,'{}'::jsonb),now(),now()
    ) on conflict(payment_id) do nothing returning * into v_tx;

    if v_tx.id is null then
      select * into v_tx from public.payment_transactions where payment_id=p_payment_id for update;
      if v_tx.status='success' or v_tx.processed_at is not null then
        select credits into v_new_credits from public.profiles where id=p_user_id;
        return jsonb_build_object('credited',false,'creditsAdded',0,'totalCredits',v_new_credits,'status','success','paymentId',p_payment_id,'alreadyProcessed',true);
      end if;
      raise exception 'payment_transaction_conflict';
    end if;
  end if;

  update public.profiles set credits=credits+p_credits, updated_at=now()
  where id=p_user_id returning credits into v_new_credits;
  if not found then raise exception 'profile_not_found_for_payment'; end if;

  return jsonb_build_object('credited',true,'creditsAdded',p_credits,'totalCredits',v_new_credits,'status','success','paymentId',p_payment_id,'alreadyProcessed',false);
end;
$function$;
