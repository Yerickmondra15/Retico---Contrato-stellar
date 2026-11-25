extern crate std;

use crate::{storage::DataKey, DepositStatus, Error, ReTico, ReTicoClient};
use soroban_sdk::{
    symbol_short,
    testutils::{
        storage::Persistent as _, Address as _, AuthorizedFunction, AuthorizedInvocation, Events,
        Ledger, MockAuth, MockAuthInvoke,
    },
    token, Address, Env, IntoVal, Symbol,
};

struct Fixture {
    env: Env,
    contract: Address,
    token: Address,
    issuer: Address,
    merchant: Address,
    customer: Address,
}

impl Fixture {
    fn new() -> Self {
        let env = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        let issuer = Address::generate(&env);
        let merchant = Address::generate(&env);
        let customer = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(issuer.clone())
            .address();
        let contract = env.register(ReTico, (&merchant, &token));
        let fixture = Self {
            env,
            contract,
            token,
            issuer,
            merchant,
            customer,
        };
        fixture.mint(&fixture.customer, 100);
        fixture
    }

    fn client(&self) -> ReTicoClient<'_> {
        ReTicoClient::new(&self.env, &self.contract)
    }

    fn balance(&self, address: &Address) -> i128 {
        token::Client::new(&self.env, &self.token).balance(address)
    }

    fn mint(&self, address: &Address, amount: i128) {
        self.asset_admin("mint", (address, amount).into_val(&self.env));
        token::StellarAssetClient::new(&self.env, &self.token).mint(address, &amount);
    }

    fn asset_admin(&self, function: &str, args: soroban_sdk::Vec<soroban_sdk::Val>) {
        self.env.mock_auths(&[MockAuth {
            address: &self.issuer,
            invoke: &MockAuthInvoke {
                contract: &self.token,
                fn_name: function,
                args,
                sub_invokes: &[],
            },
        }]);
    }

    fn create(&self, customer: &Address, amount: i128) -> u64 {
        self.client()
            .mock_auths(&[MockAuth {
                address: customer,
                invoke: &MockAuthInvoke {
                    contract: &self.contract,
                    fn_name: "create_deposit",
                    args: (customer, amount).into_val(&self.env),
                    sub_invokes: &[MockAuthInvoke {
                        contract: &self.token,
                        fn_name: "transfer",
                        args: (customer, &self.contract, amount).into_val(&self.env),
                        sub_invokes: &[],
                    }],
                },
            }])
            .create_deposit(customer, &amount)
    }

    fn authorize_refund(&self, signer: &Address, id: u64) {
        self.env.mock_auths(&[MockAuth {
            address: signer,
            invoke: &MockAuthInvoke {
                contract: &self.contract,
                fn_name: "refund_deposit",
                args: (id,).into_val(&self.env),
                sub_invokes: &[],
            },
        }]);
    }
}

#[test]
fn deposit_custodies_tokens_and_records_customer_authorization() {
    let f = Fixture::new();
    f.env.ledger().with_mut(|ledger| ledger.timestamp = 100);
    assert_eq!(f.create(&f.customer, 10), 1);
    assert_eq!(
        f.env.auths(),
        std::vec![(
            f.customer.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    f.contract.clone(),
                    Symbol::new(&f.env, "create_deposit"),
                    (&f.customer, 10_i128).into_val(&f.env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        f.token.clone(),
                        symbol_short!("transfer"),
                        (&f.customer, &f.contract, 10_i128).into_val(&f.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            },
        )]
    );
    let deposit = f.client().get_deposit(&1);
    assert_eq!(deposit.id, 1);
    assert_eq!(deposit.customer, f.customer);
    assert_eq!(deposit.amount, 10);
    assert_eq!(deposit.status, DepositStatus::Pending);
    assert_eq!(deposit.created_at, 100);
    assert_eq!(deposit.refunded_at, None);
    assert_eq!(f.balance(&f.customer), 90);
    assert_eq!(f.balance(&f.contract), 10);
}

#[test]
fn merchant_refunds_exact_amount_once() {
    let f = Fixture::new();
    f.create(&f.customer, 10);
    f.env.ledger().with_mut(|ledger| ledger.timestamp = 200);
    f.authorize_refund(&f.merchant, 1);
    f.client().refund_deposit(&1);
    assert_eq!(f.env.auths()[0].0, f.merchant);
    let deposit = f.client().get_deposit(&1);
    assert_eq!(deposit.status, DepositStatus::Refunded);
    assert_eq!(deposit.refunded_at, Some(200));
    assert_eq!(f.balance(&f.customer), 100);
    assert_eq!(f.balance(&f.contract), 0);

    f.authorize_refund(&f.merchant, 1);
    assert_eq!(
        f.client().try_refund_deposit(&1),
        Err(Ok(Error::AlreadyRefunded))
    );
    assert_eq!(f.balance(&f.customer), 100);
    assert_eq!(f.balance(&f.contract), 0);
}

#[test]
fn rejects_zero_and_negative_amounts() {
    let f = Fixture::new();
    for amount in [0, -1, i128::MIN] {
        assert_eq!(
            f.client().try_create_deposit(&f.customer, &amount),
            Err(Ok(Error::InvalidAmount))
        );
    }
    assert_eq!(f.create(&f.customer, 10), 1);
}

#[test]
fn rejects_unsigned_deposit() {
    let f = Fixture::new();
    assert!(matches!(
        f.client().try_create_deposit(&f.customer, &10),
        Err(Err(_))
    ));
    assert_eq!(f.balance(&f.customer), 100);
    assert_eq!(
        f.client().try_get_deposit(&1),
        Err(Ok(Error::DepositNotFound))
    );
}

#[test]
fn rejects_customer_and_stranger_refund_authorizations() {
    let f = Fixture::new();
    f.create(&f.customer, 10);
    for signer in [&f.customer, &Address::generate(&f.env)] {
        f.authorize_refund(signer, 1);
        assert!(matches!(f.client().try_refund_deposit(&1), Err(Err(_))));
    }
    assert_eq!(f.client().get_deposit(&1).status, DepositStatus::Pending);
    assert_eq!(f.balance(&f.contract), 10);
}

#[test]
fn rejects_unsigned_refund() {
    let f = Fixture::new();
    f.create(&f.customer, 10);
    f.env.mock_auths(&[]);
    assert!(matches!(f.client().try_refund_deposit(&1), Err(Err(_))));
    assert_eq!(f.balance(&f.contract), 10);
}

#[test]
fn missing_deposit_has_typed_error() {
    let f = Fixture::new();
    assert_eq!(
        f.client().try_get_deposit(&91),
        Err(Ok(Error::DepositNotFound))
    );
    f.authorize_refund(&f.merchant, 91);
    assert_eq!(
        f.client().try_refund_deposit(&91),
        Err(Ok(Error::DepositNotFound))
    );
}

#[test]
fn failed_token_transfer_does_not_create_deposit_or_skip_id() {
    let f = Fixture::new();
    assert!(f
        .client()
        .mock_all_auths()
        .try_create_deposit(&f.customer, &101)
        .is_err());
    assert_eq!(
        f.client().try_get_deposit(&1),
        Err(Ok(Error::DepositNotFound))
    );
    assert_eq!(f.balance(&f.contract), 0);
    assert_eq!(f.create(&f.customer, 10), 1);
}

#[test]
fn failed_refund_rolls_back_state() {
    let f = Fixture::new();
    f.create(&f.customer, 10);

    // Simulate the token rejecting the refund by draining the test escrow.
    token::Client::new(&f.env, &f.token)
        .mock_all_auths()
        .transfer(&f.contract, &f.issuer, &10);
    f.authorize_refund(&f.merchant, 1);
    assert!(f.client().try_refund_deposit(&1).is_err());
    let deposit = f.client().get_deposit(&1);
    assert_eq!(deposit.status, DepositStatus::Pending);
    assert_eq!(deposit.refunded_at, None);
    assert_eq!(f.balance(&f.customer), 90);
}

#[test]
fn deposits_are_independent_and_ids_are_sequential() {
    let f = Fixture::new();
    let other = Address::generate(&f.env);
    f.mint(&other, 40);
    assert_eq!(f.create(&f.customer, 10), 1);
    assert_eq!(f.create(&other, 30), 2);
    assert_eq!(f.create(&f.customer, 5), 3);
    f.authorize_refund(&f.merchant, 2);
    f.client().refund_deposit(&2);
    assert_eq!(f.balance(&other), 40);
    assert_eq!(f.balance(&f.customer), 85);
    assert_eq!(f.balance(&f.contract), 15);
    assert_eq!(f.client().get_deposit(&1).status, DepositStatus::Pending);
    assert_eq!(f.client().get_deposit(&3).status, DepositStatus::Pending);
}

#[test]
fn events_report_customer_id_and_amount() {
    let f = Fixture::new();
    f.create(&f.customer, 10);
    let created = f.env.events().all().filter_by_contract(&f.contract);
    f.authorize_refund(&f.merchant, 1);
    f.client().refund_deposit(&1);
    let refunded = f.env.events().all().filter_by_contract(&f.contract);

    for (event, name) in [(created, "deposit_created"), (refunded, "deposit_refunded")] {
        assert_eq!(
            event,
            soroban_sdk::vec![
                &f.env,
                (
                    f.contract.clone(),
                    (Symbol::new(&f.env, name), &f.customer, 1_u64).into_val(&f.env),
                    10_i128.into_val(&f.env),
                )
            ]
        );
    }
}

#[test]
fn persistent_ttl_is_extended_on_create_and_refund() {
    let f = Fixture::new();
    f.env.ledger().set_max_entry_ttl(9_000);
    f.create(&f.customer, 10);
    let max = f.env.storage().max_ttl();
    let ttl = || {
        f.env.as_contract(&f.contract, || {
            f.env.storage().persistent().get_ttl(&DataKey::Deposit(1))
        })
    };
    assert_eq!(ttl(), max);

    // Raise the network cap so the deposit falls below the new renewal threshold.
    f.env.ledger().set_max_entry_ttl(20_000);
    let max = f.env.storage().max_ttl();
    assert!(ttl() < max / 2);
    f.authorize_refund(&f.merchant, 1);
    f.client().refund_deposit(&1);
    assert_eq!(ttl(), max);
}

#[test]
fn id_overflow_is_rejected_without_charging() {
    let f = Fixture::new();
    f.env.as_contract(&f.contract, || {
        f.env.storage().instance().set(&DataKey::NextId, &u64::MAX)
    });
    assert_eq!(
        f.client()
            .mock_all_auths()
            .try_create_deposit(&f.customer, &10),
        Err(Ok(Error::IdOverflow)),
    );
    assert_eq!(f.balance(&f.customer), 100);
}
