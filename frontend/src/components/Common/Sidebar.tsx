import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  IconButton,
  Image,
  Link,
  Text,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react"
import { Link as RouterLink } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { FiLogOut, FiMenu } from "react-icons/fi"

import Logo from "/assets/images/company-logo.svg"
import type { UserPublic } from "../../client"
import useAuth from "../../hooks/useAuth"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const queryClient = useQueryClient()
  const bgColor = useColorModeValue("ui.light", "ui.dark")
  const textColor = useColorModeValue("ui.dark", "ui.light")
  const secBgColor = useColorModeValue("ui.secondary", "ui.darkSlate")
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { logout } = useAuth()

  const handleLogout = async () => {
    logout()
  }

  return (
    <>
      {/* Mobile */}
      <IconButton
        onClick={onOpen}
        display={{ base: "flex", md: "none" }}
        aria-label="Open Menu"
        position="absolute"
        fontSize="20px"
        m={4}
        icon={<FiMenu />}
      />
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent maxW="250px">
          <DrawerCloseButton />
          <DrawerBody py={8}>
            <Flex flexDir="column" justify="space-between" h="100%">
              <Box>
                <Link as={RouterLink} to="/">
                  <Image src={Logo} alt="logo" p={6} pl={2} />
                </Link>
                <SidebarItems onClose={onClose} />
              </Box>
              <Box>
                <Flex
                  as="button"
                  w="100%"
                  borderRadius={12}
                  p={2}
                  bgColor="ui.danger"
                  color={textColor}
                  fontWeight="bold"
                  alignItems="center"
                  onClick={handleLogout}
                >
                  <FiLogOut />
                  <Text ml={2}>로그아웃</Text>
                </Flex>

                {currentUser?.email && (
                  <Text color={textColor} noOfLines={2} fontSize="sm" p={2}>
                    현재 로그인 계정: {currentUser.email}
                  </Text>
                )}
              </Box>
            </Flex>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Desktop */}
      <Box
        bg={bgColor}
        p={3}
        h="100vh"
        position="sticky"
        top="0"
        display={{ base: "none", md: "flex" }}
      >
        <Flex
          flexDir="column"
          justify="space-between"
          bg={secBgColor}
          p={4}
          borderRadius={12}
        >
          <Flex flexDir="column" gap={4}>
            <Link as={RouterLink} to="/" my={2}>
              <Image src={Logo} alt="Logo" w="180px" maxW="2xs" p={4} pl={2} />
            </Link>
            <SidebarItems />
          </Flex>
          {currentUser?.email && (
            <Text
              color={textColor}
              noOfLines={2}
              fontSize="sm"
              p={2}
              maxW="180px"
            >
              현재 로그인 계정: {currentUser.email}
            </Text>
          )}
        </Flex>
      </Box>
    </>
  )
}

export default Sidebar
