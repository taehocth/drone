// import { FaPlus } from "react-icons/fa"
// import { Button } from "../ui/button"

interface NavbarProps {
  children?: React.ReactNode
}

const Navbar = ({ children }: NavbarProps) => {
  return (
    <header className="flex gap-1 py-2">
      {/* TODO: Complete search functionality */}
      {/* <InputGroup w={{ base: '100%', md: 'auto' }}>
                    <InputLeftElement pointerEvents='none'>
                        <Icon as={FaSearch} color='ui.dim' />
                    </InputLeftElement>
                    <Input type='text' placeholder='Search' fontSize={{ base: 'sm', md: 'inherit' }} borderRadius='8px' />
                </InputGroup> */}
      {/* <Button className="flex gap-1 text-sm">
          <FaPlus />
          <Icon as={FaPlus} />
          추가 {type}
        </Button> */}
      {/* <AddModal /> */}
      {children}
    </header>
  )
}

export default Navbar
