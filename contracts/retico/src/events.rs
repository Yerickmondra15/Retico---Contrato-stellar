use soroban_sdk::{contractevent, Address};

#[contractevent(data_format = "single-value")]
pub struct DepositCreated {
    #[topic]
    pub customer: Address,
    #[topic]
    pub deposit_id: u64,
    pub amount: i128,
}

#[contractevent(data_format = "single-value")]
pub struct DepositRefunded {
    #[topic]
    pub customer: Address,
    #[topic]
    pub deposit_id: u64,
    pub amount: i128,
}
