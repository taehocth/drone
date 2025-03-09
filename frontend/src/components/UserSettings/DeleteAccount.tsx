// import {
//   Button,
//   Container,
//   Heading,
//   Text,
//   useDisclosure,
// } from "@chakra-ui/react"

import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  // const confirmationModal = useDisclosure()

  return (
    <>
      <div className="m-20">delete account</div>

      {/* <div maxW="full">
        <h2 size="sm" py={4}>
          Delete Account
        </h2>
        <Text>
          Permanently delete your data and everything associated with your
          account.
        </Text>
        <Button variant="danger" mt={4} onClick={confirmationModal.onOpen}>
          Delete
        </Button>
        <DeleteConfirmation
          isOpen={confirmationModal.isOpen}
          onClose={confirmationModal.onClose}
        />
      </div> */}
    </>
  )
}
export default DeleteAccount
