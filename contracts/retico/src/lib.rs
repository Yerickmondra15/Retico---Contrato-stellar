#![no_std]

mod errors;
mod events;
mod storage;

pub use errors::Error;
pub use storage::{Deposit, DepositStatus};

use events::{DepositCreated, DepositRefunded};
use soroban_sdk::{contract, contractimpl, token, Address, Env};
use storage::{extend_instance, save_deposit, DataKey};

#[contract]
pub struct ReTico;

#[contractimpl]
impl ReTico {
    pub fn __constructor(env: Env, merchant: Address, token: Address) {
        let instance = env.storage().instance();
        instance.set(&DataKey::Merchant, &merchant);
        instance.set(&DataKey::Token, &token);
        instance.set(&DataKey::NextId, &1_u64);
        extend_instance(&env);
    }

    pub fn create_deposit(env: Env, customer: Address, amount: i128) -> Result<u64, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        customer.require_auth();

        let instance = env.storage().instance();
        let id: u64 = instance.get(&DataKey::NextId).unwrap();
        let next_id = id.checked_add(1).ok_or(Error::IdOverflow)?;
        let token: Address = instance.get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &customer,
            &env.current_contract_address(),
            &amount,
        );

        save_deposit(
            &env,
            &Deposit {
                id,
                customer: customer.clone(),
                amount,
                status: DepositStatus::Pending,
                created_at: env.ledger().timestamp(),
                refunded_at: None,
            },
        );
        instance.set(&DataKey::NextId, &next_id);
        extend_instance(&env);
        DepositCreated {
            customer,
            deposit_id: id,
            amount,
        }
        .publish(&env);
        Ok(id)
    }

    pub fn refund_deposit(env: Env, deposit_id: u64) -> Result<(), Error> {
        Self::get_merchant(env.clone()).require_auth();

        let mut deposit = Self::get_deposit(env.clone(), deposit_id)?;
        if deposit.status == DepositStatus::Refunded {
            return Err(Error::AlreadyRefunded);
        }

        deposit.status = DepositStatus::Refunded;
        deposit.refunded_at = Some(env.ledger().timestamp());
        save_deposit(&env, &deposit);
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &deposit.customer,
            &deposit.amount,
        );
        extend_instance(&env);
        DepositRefunded {
            customer: deposit.customer,
            deposit_id,
            amount: deposit.amount,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_deposit(env: Env, deposit_id: u64) -> Result<Deposit, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Deposit(deposit_id))
            .ok_or(Error::DepositNotFound)
    }

    pub fn get_merchant(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Merchant).unwrap()
    }
}

#[cfg(test)]
mod test;
