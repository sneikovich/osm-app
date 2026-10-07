# All service VMs in one place: `vagrant up` from this directory.
# Provisioning: Ansible (deploy/ansible/site.yml) runs once, from the last VM, against all of them.
# Rust binaries must be built first: deploy/build.sh (deploy/up.sh does both).

ENV["VAGRANT_DEFAULT_PROVIDER"] ||= "libvirt"
# Ansible runs from the last VM against all of them, so the others must already be up.
ENV["VAGRANT_NO_PARALLEL"] ||= "yes"

VMS = {
  "postgres" => { ip: "192.168.56.10", memory: 1024, group: "database" },
  "history"  => { ip: "192.168.56.11", group: "history_svc" },
  "fetcher"  => { ip: "192.168.56.12", group: "fetcher_svc" },
  "frontend" => { ip: "192.168.56.13", group: "web" },
}

Vagrant.configure("2") do |config|
  config.vm.box = "debian/trixie64"
  # Ansible copies everything the VMs need; no shared folder.
  config.vm.synced_folder ".", "/vagrant", disabled: true

  VMS.each_with_index do |(name, vm), i|
    config.vm.define name do |m|
      m.vm.hostname = name
      m.vm.network "private_network", ip: vm[:ip]

      m.vm.provider "libvirt" do |lv|
        lv.memory = vm.fetch(:memory, 512)
        lv.cpus = 1
      end

      next unless i == VMS.size - 1

      m.vm.provision "ansible" do |ansible|
        ansible.playbook = "deploy/ansible/site.yml"
        ansible.config_file = "deploy/ansible/ansible.cfg"
        ansible.compatibility_mode = "2.0"
        ansible.limit = "all"
        # Group names differ from host names on purpose: Ansible warns on clashes.
        ansible.groups = VMS.to_h { |n, v| [v[:group], [n]] }
      end
    end
  end
end
