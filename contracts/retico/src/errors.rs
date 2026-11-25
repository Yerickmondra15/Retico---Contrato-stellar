use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    DepositNotFound = 2,
    AlreadyRefunded = 3,
    IdOverflow = 4,
}
