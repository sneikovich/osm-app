# All service VMs in one place: `vagrant up` from this directory.
# Provisioning: shell scripts from deploy/scripts/, run by Vagrant inside each VM right after it boots.
# Rust binaries must be built first: deploy/build.sh (deploy/up.sh does both).

ENV["VAGRANT_DEFAULT_PROVIDER"] ||= "libvirt"
# VMs come up (and provision) one by one in definition order, so postgres is ready before history.
ENV["VAGRANT_NO_PARALLEL"] ||= "yes"

NET = {
  "POSTGRES_IP" => "192.168.56.10",
  "HISTORY_IP"  => "192.168.56.11",
  "FETCHER_IP"  => "192.168.56.12",
  "FRONTEND_IP" => "192.168.56.13",
}

# Everything the scripts need; passed to them as environment variables.
SETTINGS = NET.merge(
  "DB_NAME" => "history",
  "DB_USER" => "history",
  "DB_PASSWORD" => "history", # dev only
  "OVERPASS_ENDPOINT" => "https://overpass-api.de/api/interpreter",
  "OVERPASS_RETRIES" => "3",
)

SCRIPTS = "deploy/scripts"
DIST = "deploy/dist"

# Fail early with a hint instead of a "source file not found" from the file provisioner.
if %w[up provision reload].include?(ARGV[0])
  targets = ARGV[1..].reject { |a| a.start_with?("-") }
  { "history" => "history", "fetcher" => "overpass-server" }.each do |vm, bin|
    next unless targets.empty? || targets.include?(vm)
    path = File.join(__dir__, DIST, bin)
    abort "#{path} not found: run deploy/build.sh first" unless File.exist?(path)
  end
end

def rust_service(m, name:, binary:, port:, env:)
  m.vm.provision "binary", type: "file", source: "#{DIST}/#{binary}", destination: "/tmp/provision/#{binary}"
  m.vm.provision "service", type: "shell", path: "#{SCRIPTS}/rust-service.sh", env: SETTINGS.merge(
    "SVC_NAME" => name,
    "SVC_BINARY" => binary,
    "SVC_PORT" => port.to_s,
    "SVC_ENV" => env.map { |k, v| "#{k}=#{v}" }.join("\n"),
  )
end

Vagrant.configure("2") do |config|
  config.vm.box = "debian/trixie64"
  # Files are pushed with the file provisioner; no shared folder (on libvirt that would mean NFS).
  config.vm.synced_folder ".", "/vagrant", disabled: true

  config.vm.provider "libvirt" do |lv|
    lv.memory = 512
    lv.cpus = 1
  end

  # Runs on every VM before its own provisioners.
  config.vm.provision "lib", type: "file", source: "#{SCRIPTS}/lib.sh", destination: "/tmp/provision/lib.sh"
  config.vm.provision "common", type: "shell", path: "#{SCRIPTS}/common.sh"

  config.vm.define "postgres" do |m|
    m.vm.hostname = "postgres"
    m.vm.network "private_network", ip: NET["POSTGRES_IP"]
    m.vm.provider("libvirt") { |lv| lv.memory = 1024 }
    m.vm.provision "postgres", type: "shell", path: "#{SCRIPTS}/postgres.sh", env: SETTINGS
  end

  config.vm.define "history" do |m|
    m.vm.hostname = "history"
    m.vm.network "private_network", ip: NET["HISTORY_IP"]
    rust_service m, name: "history", binary: "history", port: 8081, env: {
      "HISTORY_LISTEN" => "0.0.0.0:8081",
      "DATABASE_URL" => "postgres://#{SETTINGS["DB_USER"]}:#{SETTINGS["DB_PASSWORD"]}@#{NET["POSTGRES_IP"]}:5432/#{SETTINGS["DB_NAME"]}",
      "HISTORY_CONNECT_WAIT" => 60,
    }
  end

  config.vm.define "fetcher" do |m|
    m.vm.hostname = "fetcher"
    m.vm.network "private_network", ip: NET["FETCHER_IP"]
    rust_service m, name: "overpass-fetcher", binary: "overpass-server", port: 8080, env: {
      "OVERPASS_LISTEN" => "0.0.0.0:8080",
      "OVERPASS_ENDPOINT" => SETTINGS["OVERPASS_ENDPOINT"],
      "OVERPASS_RETRIES" => SETTINGS["OVERPASS_RETRIES"],
      "HISTORY_URL" => "http://#{NET["HISTORY_IP"]}:8081",
    }
  end

  config.vm.define "frontend" do |m|
    m.vm.hostname = "frontend"
    m.vm.network "private_network", ip: NET["FRONTEND_IP"]
    %w[index.html app.js style.css].each do |f|
      m.vm.provision "www-#{f}", type: "file", source: "frontend/#{f}", destination: "/tmp/provision/www/#{f}"
    end
    m.vm.provision "frontend", type: "shell", path: "#{SCRIPTS}/frontend.sh", env: SETTINGS
  end
end
