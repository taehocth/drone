import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { EllipsisVertical } from "lucide-react"
import { Edit, Trash } from "lucide-react"

import type { ItemPublic, UserPublic } from "../../client"
import EditUserDialog from "../Admin/EditUserDialog"
import EditItemDialog from "../Items/EditItemDialog"
// import Delete from "./DeleteAlert"
import { Button } from "../ui/button"

interface RowActionsMenuProps {
  type: string
  value: ItemPublic | UserPublic
  disabled?: boolean
}

const RowActionsMenu = ({ type, value, disabled }: RowActionsMenuProps) => {
  // const editUserModal = useDisclosure()
  // const deleteModal = useDisclosure()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger disabled={disabled}>
          <Button>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{type} 수정</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Billing</DropdownMenuItem>
          <DropdownMenuItem>
            <Edit />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Trash />
          </DropdownMenuItem>
          {type === "User" ? (
            <EditUserDialog user={value as UserPublic} />
          ) : (
            <EditItemDialog item={value as ItemPublic} />
          )}
          <DropdownMenuItem>
            {/* <Delete
              type={type}
              id={value.id}
              isOpen={deleteModal.isOpen}
              onClose={deleteModal.onClose}
            /> */}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* <Menu>
        <MenuButton
          isDisabled={disabled}
          as={Button}
          rightIcon={<BsThreeDotsVertical />}
          variant="unstyled"
        />
        <MenuList>
          <MenuItem
            onClick={editUserModal.onOpen}
            icon={<FiEdit fontSize="16px" />}
          >
            Edit {type}
          </MenuItem>
          <MenuItem
            onClick={deleteModal.onOpen}
            icon={<FiTrash fontSize="16px" />}
            color="ui.danger"
          >
            Delete {type}
          </MenuItem>
        </MenuList>
        {type === "User" ? (
          <EditUser
            user={value as UserPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : (
          <EditItemDialog
            item={value as ItemPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        )}
        <Delete
          type={type}
          id={value.id}
          isOpen={deleteModal.isOpen}
          onClose={deleteModal.onClose}
        />
      </Menu> */}
    </>
  )
}

export default RowActionsMenu
