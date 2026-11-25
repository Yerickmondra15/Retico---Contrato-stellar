use soroban_sdk::{contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DepositStatus {
    Pending,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    pub id: u64,
    pub customer: Address,
    pub amount: i128,
    pub status: DepositStatus,
    pub created_at: u64,
    pub refunded_at: Option<u64>,
}

#[contracttype]
pub(crate) enum DataKey {
    Merchant,
    Token,
    NextId,
    Deposit(u64),
}

pub(crate) fn extend_instance(env: &Env) {
    let maximum = env.storage().max_ttl();
    env.storage().instance().extend_ttl(maximum / 2, maximum);
}

pub(crate) fn save_deposit(env: &Env, deposit: &Deposit) {
    let key = DataKey::Deposit(deposit.id);
    let maximum = env.storage().max_ttl();
    let persistent = env.storage().persistent();
    persistent.set(&key, deposit);
    persistent.extend_ttl(&key, maximum / 2, maximum);
}
